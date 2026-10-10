"""
capium.browser_async -- async variants of the launch API (playwright.async_api).

Mirrors capium.browser: native launch, no Patchright, same proxy/geoip/humanize behavior.
    launch_async(...)                    -> Browser
    launch_persistent_context_async(...) -> BrowserContext
    launch_context_async(...)            -> (browser, context, page)
"""
import asyncio
import atexit
import os

from ._driver import get_async_playwright

from . import config
from .network import proxy as _proxy
from .licensing import client as _license
from .licensing import readiness as _readiness
from .browser import _resolve_binary, _build_args, _new_status_file, _clear_status_file, _apply_viewport_defaults
from .errors import translate_launch_error, read_launch_status


async def _license_preflight_async(license_key, license_server, do_preflight):
    """Run the instant, offline no-key preflight off the event loop (resolve() does a tiny
    file read). Raises CapiumConfigError when no key is configured; the server-side reasons
    come back from the binary's own check via its status file, not a duplicate SDK call."""
    if not do_preflight:
        return
    await asyncio.get_running_loop().run_in_executor(
        None, _license.preflight, license_key, license_server)


async def _proxy_and_geo_args_async(spec, binpath, geoip_on, display):
    """Return (proxy_kwargs, chrome_args). proxy_kwargs for Playwright auth; chrome_args for
    native --proxy-server + geo flags. The binary's CapiumGeoipResolver runs at PreBrowserStart
    ONLY when --geoip is present (a proxy alone does NOT trigger it -- the lookup is a blocking
    round-trip we don't pay unasked). geoip_on is tri-state: None = default OFF (no lookup, no
    launch latency, even with a proxy), True = ON (--geoip), False = explicit opt-out
    (--geoip=false, honored first)."""
    proxy_kwargs, out = _proxy.resolve_proxy_config(spec)
    out = list(out)
    if geoip_on is None:
        pass
    elif geoip_on:
        out.append("--geoip")
    else:
        out.append("--geoip=false")
    return proxy_kwargs, out


def _wrap_close_async(obj, pw):
    orig = obj.close
    done = {"v": False}

    async def close(*a, **k):
        if done["v"]:
            return
        done["v"] = True
        try:
            await orig(*a, **k)
        finally:
            try:
                await pw.stop()
            except Exception:
                pass

    obj.close = close
    return obj


async def launch_async(seed=None, platform="windows", headless=False, proxy=None, geoip=None,
                       args=None, stealth_args=True, timezone=None, locale=None,
                       extension_paths=None, binary=None, license_key=None,
                       license_server=None, license_through_proxy=False,
                       license_preflight=True, driver=None, **kwargs):
    """Async launch -> Browser (await browser.close() also stops Playwright).

    driver: "playwright" (default) or the installed "patchright" fork.
    CAPIUM_DRIVER=patchright also works. Evaluation-world defaults and API
    compatibility depend on the installed version. See capiumbrowser._driver.
    """
    await _license_preflight_async(license_key, license_server, license_preflight)
    key, _ = _license.effective(license_key, license_server)
    binpath = _resolve_binary(binary, key)
    if seed is None:
        seed = config.new_seed()
    display = os.environ.get("DISPLAY")
    proxy_kwargs, proxy_args = await _proxy_and_geo_args_async(proxy, binpath, geoip, display)
    launch_args = proxy_args + _build_args(
        seed, platform, stealth_args, timezone, locale, extension_paths, args, headless)
    if license_through_proxy:
        launch_args.append("--license-through-proxy")
    env = _license.child_env(license_key, license_server)
    status_path = _new_status_file(env)
    # Strip Playwright's automation + forced-software-WebGL defaults;
    # the caller can override by passing ignore_default_args explicitly.
    kwargs.setdefault("ignore_default_args", list(config.IGNORE_DEFAULT_ARGS))
    pw = await get_async_playwright(driver)().start()
    browser = None
    try:
        browser = await pw.chromium.launch(executable_path=binpath, headless=headless,
                                           args=launch_args, env=env, **proxy_kwargs, **kwargs)
        await _readiness.wait_async(binpath, status_path, kwargs.get('timeout', 30000))
    except Exception as e:
        # Native refusal already terminates the browser; closing its dead CDP connection can hang.
        if not read_launch_status(status_path) and browser is not None:
            try:
                await browser.close()
            except Exception:
                pass
        try:
            await pw.stop()
        except Exception:
            pass
        t = read_launch_status(status_path) or translate_launch_error(e)
        _clear_status_file(status_path)
        if t:
            raise t from e
        raise
    _clear_status_file(status_path)
    browser._capium_seed = seed
    return _wrap_close_async(_apply_viewport_defaults(browser, asynchronous=True), pw)


async def launch_persistent_context_async(user_data_dir, seed=None, platform="windows",
                                          headless=False, proxy=None, geoip=None, args=None,
                                          stealth_args=True, timezone=None, locale=None,
                                          extension_paths=None, binary=None, license_key=None,
                                          license_server=None, license_through_proxy=False,
                                          license_preflight=True, driver=None,
                                          **kwargs):
    """Async persistent context -> BrowserContext."""
    await _license_preflight_async(license_key, license_server, license_preflight)
    key, _ = _license.effective(license_key, license_server)
    binpath = _resolve_binary(binary, key)
    if seed is None:
        seed = config.new_seed()
    display = os.environ.get("DISPLAY")
    proxy_kwargs, proxy_args = await _proxy_and_geo_args_async(proxy, binpath, geoip, display)
    launch_args = proxy_args + _build_args(
        seed, platform, stealth_args, timezone, locale, extension_paths, args, headless)
    if license_through_proxy:
        launch_args.append("--license-through-proxy")
    env = _license.child_env(license_key, license_server)
    status_path = _new_status_file(env)
    if "viewport" not in kwargs and "no_viewport" not in kwargs:
        kwargs["no_viewport"] = True
    # Strip Playwright's automation + forced-software-WebGL defaults;
    # the caller can override by passing ignore_default_args explicitly.
    kwargs.setdefault("ignore_default_args", list(config.IGNORE_DEFAULT_ARGS))
    pw = await get_async_playwright(driver)().start()
    ctx = None
    try:
        ctx = await pw.chromium.launch_persistent_context(
            user_data_dir, executable_path=binpath, headless=headless,
            args=launch_args, env=env, **proxy_kwargs, **kwargs)
        await _readiness.wait_async(binpath, status_path, kwargs.get('timeout', 30000))
    except Exception as e:
        # Native refusal already terminates the browser; closing its dead CDP connection can hang.
        if not read_launch_status(status_path) and ctx is not None:
            try:
                await ctx.close()
            except Exception:
                pass
        try:
            await pw.stop()
        except Exception:
            pass
        t = read_launch_status(status_path) or translate_launch_error(e)
        _clear_status_file(status_path)
        if t:
            raise t from e
        raise
    _clear_status_file(status_path)
    ctx._capium_seed = seed
    return _wrap_close_async(ctx, pw)


async def launch_context_async(seed=None, platform="windows", headless=False, url=None,
                               humanize=False, human_preset="default", **kwargs):
    """Async convenience -> (browser, context, page)."""
    browser = await launch_async(seed=seed, platform=platform, headless=headless, **kwargs)
    # no_viewport: page fills the real window (see browser.launch_context).
    context = (browser.contexts[0] if browser.contexts
               else await browser.new_context(no_viewport=True))
    if humanize:
        from . import human as _human
        _human.humanize(context, preset=human_preset)
    page = context.pages[0] if context.pages else await context.new_page()
    if url:
        await page.goto(url, wait_until="domcontentloaded", timeout=60000)
    return browser, context, page
