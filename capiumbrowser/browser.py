"""
capium.browser -- launch a stealth Capium browser through vanilla Playwright.

We use Playwright's NATIVE launch()/launch_persistent_context() with executable_path pointed
at the capium bash wrapper (which adds GL/geoip/font/bluetooth/storage flags). No Patchright:
capium's in-binary patches (001 -> developer_tools=false, 009 -> navigator.webdriver=false)
provide the CDP hardening, so plain Playwright avoids the common automation tells.

Public API (Part 1):
    launch(...)                     -> Browser
    launch_context(...)             -> (browser, context, page)
    launch_persistent_context(...)  -> BrowserContext           (cookies/state persist)
Proxy and humanize are layered in by later modules (see network/proxy.py / human/); geo
coherence is resolved inside the binary via the --geoip flag (no SDK-side probe).
"""
import atexit
import os
import tempfile

from playwright.sync_api import sync_playwright

from . import config
from .network import proxy as _proxy
from .licensing import client as _license
from .errors import translate_launch_error, read_launch_status


def _resolve_binary(binary, license_key=None):
    """Find the capium wrapper; if absent, try to download it (see licensing.download)."""
    try:
        return config.find_binary(binary)
    except FileNotFoundError:
        from .licensing import download as _download
        return _download.ensure_binary(license_key=license_key)


def _new_status_file(env):
    """Create a unique empty file and point the browser at it via CAPIUM_LICENSE_STATUS_FILE.
    On a license fail-closed the binary writes "<code>\\n<message>" here, so the SDK raises a
    precise error from the binary's OWN single verification -- no second server call. A unique
    file per launch keeps concurrent launches (a fleet) from clobbering each other; an old
    binary that doesn't write it just leaves it empty -> read_launch_status None -> stderr fallback."""
    fd, path = tempfile.mkstemp(prefix="capium-lic-", suffix=".err")
    os.close(fd)
    env["CAPIUM_LICENSE_STATUS_FILE"] = path
    return path


def _clear_status_file(path):
    try:
        os.remove(path)
    except OSError:
        pass


def _proxy_and_geo_args(spec, binpath, geoip_on, display):
    """Build [--proxy-server, --geoip] flags for geo coherence.

    The binary's CapiumGeoipResolver runs at PreBrowserStart ONLY when --geoip is present. A
    proxy on its own does NOT trigger it: the lookup is a synchronous, blocking round-trip that
    would otherwise add up to 2.5s to every proxied launch. When it does run it resolves the
    egress IP (proxy exit, else the host's real public IP) and pins WebRTC / timezone /
    geolocation / language -- so the SDK adds no probe of its own. geoip_on is tri-state:
      * None  -> default: add no flag, so NO geo lookup runs (no launch latency) even with a
                 proxy. Pass geoip=True to opt into proxy-exit coherence.
      * True  -> ON with --geoip (resolves the egress -- proxy exit, or the host IP if proxyless).
      * False -> OFF with --geoip=false, which the binary honors FIRST (explicit opt-out).
    Returns (proxy_kwargs, [flags]).
    """
    proxy_kwargs, out = _proxy.resolve_proxy_config(spec)
    out = list(out)
    if geoip_on is None:
        pass
    elif geoip_on:
        out.append("--geoip")
    else:
        out.append("--geoip=false")
    return proxy_kwargs, out


def _build_args(seed, platform, stealth_args, timezone, locale, extension_paths, extra):
    args = []
    if stealth_args:
        args += config.get_default_stealth_args(seed, platform)
    if timezone:
        args.append("--timezone=%s" % timezone)          # capium in-binary tz spoof
    if locale:
        args.append("--lang=%s" % locale)
        args.append("--accept-lang=%s" % locale)
    if extension_paths:
        paths = extension_paths if isinstance(extension_paths, (list, tuple)) else [extension_paths]
        joined = ",".join(paths)
        args.append("--disable-extensions-except=%s" % joined)
        args.append("--load-extension=%s" % joined)
    if extra:
        args += list(extra)
    return args


def fit_window(browser, context, page):
    """Size a modest windowed browser that fits within the seed's spoofed screen.

    A real window is never larger than its display and is usually NOT maximized. Caps the
    window to <= the available screen with a slight offset. No-op on failure/headless.
    """
    try:
        scr = page.evaluate("()=>({w:screen.availWidth,h:screen.availHeight})")
        if not (scr and scr.get("w") and scr.get("h")):
            return
        aw, ah = int(scr["w"]), int(scr["h"])
        w = min(aw, 1440); h = min(ah, 900)
        left = max(0, (aw - w) // 5); top = max(0, (ah - h) // 6)
        pcdp = context.new_cdp_session(page)
        tid = pcdp.send("Target.getTargetInfo")["targetInfo"]["targetId"]
        bcdp = browser.new_browser_cdp_session()
        wid = bcdp.send("Browser.getWindowForTarget", {"targetId": tid})["windowId"]
        bcdp.send("Browser.setWindowBounds", {"windowId": wid, "bounds": {
            "left": left, "top": top, "width": w, "height": h, "windowState": "normal"}})
    except Exception:
        pass


def _wrap_close(obj, pw):
    """Make .close() also stop the Playwright driver so callers don't leak the process."""
    orig = obj.close
    done = {"v": False}

    def close(*a, **k):
        if done["v"]:
            return
        done["v"] = True
        try:
            orig(*a, **k)
        finally:
            try:
                pw.stop()
            except Exception:
                pass

    obj.close = close
    atexit.register(close)
    return obj


def launch(seed=None, platform="windows", headless=False, proxy=None, geoip=None, args=None,
           stealth_args=True, timezone=None, locale=None, extension_paths=None, binary=None,
           license_key=None, license_server=None, license_through_proxy=False,
           license_preflight=True, **kwargs):
    """Launch a Capium Browser (non-persistent; Playwright manages a temp profile).

    seed/platform : identity. stealth_args=False drops the default fingerprint flags.
    proxy         : "dataimpulse" | "http://user:pass@host:port" | "socks5://host:port" | dict.
    geoip         : geo coherence, resolved inside the binary. None (default) = OFF: no lookup
                    runs, even with a proxy (a proxy alone no longer triggers it, so proxied
                    launches aren't slowed). True = ON: pins timezone/geo/WebRTC/language to the
                    egress (proxy exit, or the host IP if proxyless). False = explicit opt-out.
    timezone/locale: explicit override (IANA tz + BCP-47 locale; in-binary spoof).
    license_key/license_server: pass the license programmatically (else read from
                    CAPIUM_LICENSE_KEY / ~/.capium/license). The binary self-licenses;
                    the key is handed to it via the environment, never on argv.
    license_preflight: fail fast with a typed CapiumConfigError when no license key is set
                    (default True; instant + offline), instead of an opaque Playwright crash.
                    Set False for a dev build that runs without enforcement. Server-side
                    reasons (expired / seat / down) come back from the binary's own check via
                    its status file -- the SDK never re-verifies over the network.
    kwargs        : forwarded to Playwright's chromium.launch (e.g. slow_mo=...).
    Returns a Browser whose .close() also stops Playwright.
    """
    if license_preflight:
        _license.preflight(license_key, license_server)
    key, _ = _license.effective(license_key, license_server)
    binpath = _resolve_binary(binary, key)
    if seed is None:
        seed = config.new_seed()
    display = os.environ.get("DISPLAY")
    proxy_kwargs, proxy_args = _proxy_and_geo_args(proxy, binpath, geoip, display)
    launch_args = proxy_args + _build_args(
        seed, platform, stealth_args, timezone, locale, extension_paths, args)
    if license_through_proxy:
        launch_args.append("--license-through-proxy")
    env = _license.child_env(license_key, license_server)
    status_path = _new_status_file(env)
    pw = sync_playwright().start()
    try:
        browser = pw.chromium.launch(executable_path=binpath, headless=headless,
                                     args=launch_args, env=env, **proxy_kwargs, **kwargs)
    except Exception as e:
        try:
            pw.stop()
        except Exception:
            pass
        t = read_launch_status(status_path) or translate_launch_error(e)
        _clear_status_file(status_path)
        if t:
            raise t from e
        raise
    _clear_status_file(status_path)
    browser._capium_seed = seed
    return _wrap_close(browser, pw)


def launch_persistent_context(user_data_dir, seed=None, platform="windows", headless=False,
                              proxy=None, geoip=None, args=None, stealth_args=True,
                              timezone=None, locale=None, extension_paths=None, binary=None,
                              license_key=None, license_server=None,
                              license_through_proxy=False,
                              license_preflight=True, **kwargs):
    """Launch a persistent context (cookies/localStorage/state persist in user_data_dir).

    Same options as launch(); returns a BrowserContext whose .close() also stops Playwright.
    """
    if license_preflight:
        _license.preflight(license_key, license_server)
    key, _ = _license.effective(license_key, license_server)
    binpath = _resolve_binary(binary, key)
    if seed is None:
        seed = config.new_seed()
    display = os.environ.get("DISPLAY")
    proxy_kwargs, proxy_args = _proxy_and_geo_args(proxy, binpath, geoip, display)
    launch_args = proxy_args + _build_args(
        seed, platform, stealth_args, timezone, locale, extension_paths, args)
    if license_through_proxy:
        launch_args.append("--license-through-proxy")
    env = _license.child_env(license_key, license_server)
    status_path = _new_status_file(env)
    # Default to the page filling the window (see launch_context) unless the caller
    # pinned a viewport themselves.
    if "viewport" not in kwargs and "no_viewport" not in kwargs:
        kwargs["no_viewport"] = True
    pw = sync_playwright().start()
    try:
        ctx = pw.chromium.launch_persistent_context(
            user_data_dir, executable_path=binpath, headless=headless,
            args=launch_args, env=env, **proxy_kwargs, **kwargs)
    except Exception as e:
        try:
            pw.stop()
        except Exception:
            pass
        t = read_launch_status(status_path) or translate_launch_error(e)
        _clear_status_file(status_path)
        if t:
            raise t from e
        raise
    _clear_status_file(status_path)
    ctx._capium_seed = seed
    return _wrap_close(ctx, pw)


def launch_context(seed=None, platform="windows", headless=False, url=None,
                   humanize=False, human_preset="default", **kwargs):
    """Convenience: launch() + first context + a page (optionally navigated to `url`).

    humanize=True attaches page.human_move/human_click/human_type/human_scroll (see capium.human).
    Returns (browser, context, page). page.goto(url) is done here so tampering stays clean
    (driven navigation), matching our launcher behavior.
    """
    browser = launch(seed=seed, platform=platform, headless=headless, **kwargs)
    # no_viewport: let the page fill the real window (fit_window sizes the window to
    # the persona's screen). A fixed 1280x720 emulated viewport would leave the page
    # smaller than the window AND mismatch window.screen — an incoherent fingerprint.
    context = browser.contexts[0] if browser.contexts else browser.new_context(no_viewport=True)
    if humanize:
        from . import human as _human
        _human.humanize(context, preset=human_preset)
    page = context.pages[0] if context.pages else context.new_page()
    if not headless:
        fit_window(browser, context, page)   # modest window <= spoofed screen
    if url:
        page.goto(url, wait_until="domcontentloaded", timeout=60000)
    return browser, context, page
