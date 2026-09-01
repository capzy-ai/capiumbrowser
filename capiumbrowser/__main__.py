"""capium CLI --  python -m capiumbrowser <command>

  info                environment check: license + binary + dependencies + system libraries
                      (i.e. "what do I still need installed?"). Exit 0 if ready, 1 if not.
  status              license entitlements from the server (plan, seats, live sessions, renewal)
  version             SDK version + the Chromium/Capium build it targets
  install             download the capium browser binary
  run [URL]           launch a stealth browser to URL (demo; Ctrl-C to exit)

  info/status flags:  --json   --quick (skip the license-server call)   --proxy URL
  run env:            SEED, PLATFORM (windows|macos|linux), HEADLESS=1, PROXY, GEOIP=1,
                      PROFILE=<dir> (persistent), HUMANIZE=1
"""
import argparse
import json
import os
import platform
import re
import subprocess
import sys
import time


# ---- diagnostics helpers -----------------------------------------------------

def _playwright_version():
    try:
        import importlib.metadata as m
        return m.version("playwright")
    except Exception:
        try:
            import playwright  # noqa: F401
            return getattr(playwright, "__version__", "installed")
        except Exception:
            return None


def _binary_version(binpath):
    """Ask the binary its version. `--version` prints and exits BEFORE the license gate,
    so this works without a configured license. Returns None if it can't be read."""
    try:
        out = subprocess.run([binpath, "--version"], capture_output=True, text=True,
                             timeout=15)
        return (out.stdout or out.stderr).strip() or None
    except Exception:
        return None


def _missing_linux_libs(binpath):
    """Shared libraries the engine needs but that aren't installed (Linux only). ldd the
    'chrome' engine the wrapper spawns and collect any 'not found' -- the usual cause of an
    opaque launch failure on a fresh server."""
    if platform.system() != "Linux":
        return []
    engine = os.path.join(os.path.dirname(binpath), "chrome")
    target = engine if os.path.isfile(engine) else binpath
    try:
        out = subprocess.run(["ldd", target], capture_output=True, text=True, timeout=15)
    except Exception:
        return []
    return [ln.strip().split()[0] for ln in out.stdout.splitlines() if "not found" in ln]


def _license_source():
    """Where the key is configured (env / file), with NO server call. None if unset."""
    from .licensing import client as _license
    if os.environ.get("CAPIUM_LICENSE_KEY"):
        return "env CAPIUM_LICENSE_KEY"
    key, _ = _license._from_file()   # ~/.capium/license
    return "~/.capium/license" if key else None


def _gather(quick, proxy):
    from . import config
    from .licensing import client as _license
    from ._version import __version__, CAPIUM_BINARY_VERSION
    info = {"issues": []}

    info["sdk"] = {"version": __version__, "targets_chromium": CAPIUM_BINARY_VERSION}
    info["python"] = {"version": platform.python_version(),
                      "os": platform.system(), "arch": platform.machine()}

    pv = _playwright_version()
    info["playwright"] = {"installed": pv is not None, "version": pv}
    if pv is None:
        info["issues"].append("Playwright not installed  ->  pip install playwright")

    from .licensing import download as _dl
    binary = {"found": False, "path": None, "executable": None, "version": None,
              "installed_version": None, "target_version": CAPIUM_BINARY_VERSION,
              "up_to_date": None, "platform_tag": None}
    try:
        binary["platform_tag"] = _dl.download_tag()
    except Exception as e:                       # unsupported platform (macOS Intel, Windows ARM)
        binary["platform_error"] = str(e)
        info["issues"].append(str(e))
    try:
        path = config.find_binary()
        vstr = _binary_version(path)             # e.g. "Capium 151.0.7922.137"
        m = re.search(r"\d+\.\d+\.\d+\.\d+", vstr or "")
        iv = m.group(0) if m else _dl.installed_version(path)  # marker fallback
        binary.update(found=True, path=path,
                      executable=(os.name != "posix") or os.access(path, os.X_OK),
                      version=vstr, installed_version=iv,
                      up_to_date=(iv == CAPIUM_BINARY_VERSION) if iv else None)
        if not binary["executable"]:
            info["issues"].append("Browser binary is not executable  ->  chmod +x '%s'" % path)
        if iv and iv != CAPIUM_BINARY_VERSION:
            info["issues"].append(
                "Browser binary is %s but the SDK targets %s  ->  it auto-updates on the next "
                "launch (or run: python -m capiumbrowser install)" % (iv, CAPIUM_BINARY_VERSION))
    except FileNotFoundError:
        info["issues"].append("Browser binary not installed  ->  python -m capiumbrowser install")
    info["binary"] = binary

    src = _license_source()
    lic = {"configured": src is not None, "source": src, "server_checked": False,
           "plan": None, "sessions_cap": None, "live_sessions": None, "period_end": None}
    if src is None:
        info["issues"].append("No license key  ->  set CAPIUM_LICENSE_KEY or ~/.capium/license (KEY=...)")
    elif not quick:
        try:
            st = _license.status()
            lic.update(server_checked=True, plan=st.get("plan"),
                       sessions_cap=st.get("sessions_cap"),
                       live_sessions=st.get("live_sessions"),
                       period_end=st.get("period_end"))
        except Exception as e:
            lic["server_error"] = str(e)
            info["issues"].append("License check failed  ->  %s" % e)
    info["license"] = lic

    if binary["found"]:
        missing = _missing_linux_libs(binary["path"])
        if missing:
            info["missing_libs"] = missing
            info["issues"].append("Missing system libraries: %s  (install them via your package manager)"
                                  % ", ".join(missing))

    if proxy:
        info["proxy"] = {"note": "exit IP + timezone resolved inside the browser at launch (--geoip flag)"}
    return info


def _print_human(info):
    def row(label, val, status=None):
        tag = "" if status is None else "  [%s]" % status
        print("  %-13s %s%s" % (label, val, tag))

    sdk = info["sdk"]
    py = info["python"]
    print("\nCapium browser -- environment check\n")
    row("SDK", "capiumbrowser %s  (targets Chromium %s)" % (sdk["version"], sdk["targets_chromium"]))
    row("Python", "%s on %s/%s" % (py["version"], py["os"], py["arch"]))
    pw = info["playwright"]
    row("Playwright", pw["version"] or "not installed", "OK" if pw["installed"] else "MISSING")

    b = info["binary"]
    print()
    if b.get("platform_tag"):
        row("Platform", "%s  (%s/%s)" % (b["platform_tag"], py["os"], py["arch"]))
    elif b.get("platform_error"):
        row("Platform", "unsupported: %s/%s" % (py["os"], py["arch"]), "UNSUPPORTED")
    if b["found"]:
        iv, tv = b.get("installed_version"), b.get("target_version")
        if iv and b.get("up_to_date"):
            row("Binary", "installed  v%s  (up to date)" % iv,
                "OK" if b["executable"] else "not executable")
        elif iv:
            row("Binary", "installed  v%s  ->  SDK targets v%s (auto-updates next launch)" % (iv, tv),
                "UPDATE")
        else:
            row("Binary", "installed", "OK" if b["executable"] else "not executable")
        row("", b["path"])
    else:
        row("Binary", "NOT INSTALLED", "MISSING")
        row("", "target v%s  ->  python -m capiumbrowser install" % b.get("target_version"))

    lic = info["license"]
    print()
    if lic["configured"]:
        row("License", "key from %s" % lic["source"], "OK")
        if lic.get("server_checked"):
            row("", "plan=%s  seats=%s (%s live)  renews=%s"
                % (lic["plan"], lic["sessions_cap"], lic["live_sessions"], lic["period_end"]))
        elif lic.get("server_error"):
            row("", "server check: %s" % lic["server_error"], "WARN")
    else:
        row("License", "not configured", "MISSING")

    if info.get("missing_libs"):
        print()
        row("System libs", "missing: %s" % ", ".join(info["missing_libs"]), "MISSING")

    if info.get("proxy"):
        p = info["proxy"]
        print()
        row("Proxy", p.get("error") or p.get("note") or "configured")

    print()
    if info["issues"]:
        print("%d thing(s) to fix:" % len(info["issues"]))
        for i in info["issues"]:
            print("  - %s" % i)
    else:
        print("Ready: everything needed is installed and configured.")
    print()


# ---- subcommands -------------------------------------------------------------

def _cmd_info(args):
    info = _gather(quick=args.quick, proxy=args.proxy)
    if args.json:
        print(json.dumps(info, indent=2))
    else:
        _print_human(info)
    return 1 if info["issues"] else 0


def _cmd_status(args):
    from .licensing import client as _license
    from .errors import CapiumError
    try:
        st = _license.status()
    except CapiumError as e:
        print("capium status: %s" % e, file=sys.stderr)
        return 1
    print(json.dumps(st, indent=2) if args.json
          else "\n".join("  %-14s %s" % (k, v) for k, v in st.items()))
    return 0


def _cmd_version(args):
    from ._version import __version__, CAPIUM_BINARY_VERSION
    from . import config
    from .licensing import download as _dl
    print("capiumbrowser %s (targets Chromium %s)" % (__version__, CAPIUM_BINARY_VERSION))
    try:
        path = config.find_binary()
        vstr = _binary_version(path) or ""
        m = re.search(r"\d+\.\d+\.\d+\.\d+", vstr)
        iv = m.group(0) if m else (_dl.installed_version(path) or "unknown")
        if iv == CAPIUM_BINARY_VERSION:
            print("installed binary: v%s (up to date) at %s" % (iv, path))
        else:
            print("installed binary: v%s -> updates to v%s on next launch, at %s"
                  % (iv, CAPIUM_BINARY_VERSION, path))
    except FileNotFoundError:
        print("installed binary: NOT INSTALLED -> python -m capiumbrowser install")
    return 0


def _cmd_install(args):
    from .licensing import download as _download, client as _license
    key, _ = _license.effective()
    print("downloading the capium browser binary ...")
    print("installed:", _download.ensure_binary(license_key=key))
    return 0


def _cmd_run(args):
    seed = os.environ.get("SEED")
    _geoip = os.environ.get("GEOIP")   # 1 = force on, 0 = force off, unset = auto (None)
    opts = dict(
        seed=int(seed) if seed else None,
        platform=os.environ.get("PLATFORM", "windows"),
        headless=os.environ.get("HEADLESS") == "1",
        proxy=(os.environ.get("PROXY") or None),
        geoip=True if _geoip == "1" else (False if _geoip == "0" else None),
    )
    from capiumbrowser import launch_persistent_context, launch_context
    profile = os.environ.get("PROFILE")
    if profile:
        ctx = launch_persistent_context(profile, **opts)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(args.url, wait_until="domcontentloaded", timeout=60000)
        closer = ctx
    else:
        browser, ctx, page = launch_context(
            url=args.url, humanize=os.environ.get("HUMANIZE") == "1", **opts)
        closer = browser
    print("== Capium ==")
    print("  platform :", page.evaluate("()=>navigator.platform"))
    print("  userAgent:", page.evaluate("()=>navigator.userAgent"))
    print("  url      :", args.url)
    print("Browser open. Ctrl-C to exit.")
    try:
        while True:
            time.sleep(0.5)
    except KeyboardInterrupt:
        pass
    finally:
        closer.close()
    return 0


def main():
    p = argparse.ArgumentParser(prog="python -m capiumbrowser",
                                description="Capium stealth browser CLI")
    sub = p.add_subparsers(dest="cmd")

    pi = sub.add_parser("info", help="environment check: license + binary + deps + system libs")
    pi.add_argument("--json", action="store_true", help="machine-readable output")
    pi.add_argument("--quick", action="store_true", help="skip the license-server call")
    pi.add_argument("--proxy", help="note how exit IP + timezone are resolved for this proxy")
    pi.set_defaults(fn=_cmd_info)

    ps = sub.add_parser("status", help="license entitlements from the server")
    ps.add_argument("--json", action="store_true")
    ps.set_defaults(fn=_cmd_status)

    sub.add_parser("version", help="SDK + targeted browser version").set_defaults(fn=_cmd_version)
    sub.add_parser("install", help="download the capium browser binary").set_defaults(fn=_cmd_install)

    pr = sub.add_parser("run", help="launch a stealth browser (demo)")
    pr.add_argument("url", nargs="?", default="https://fingerprint.com/demo/")
    pr.set_defaults(fn=_cmd_run)

    args = p.parse_args()
    if not getattr(args, "cmd", None):
        # No subcommand -> the diagnostic, so a bare `python -m capiumbrowser` is useful.
        return sys.exit(_cmd_info(argparse.Namespace(json=False, quick=False, proxy=None)))
    sys.exit(args.fn(args))


if __name__ == "__main__":
    main()
