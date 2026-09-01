"""
capium.config -- default stealth arguments and binary discovery.

The capium binary is driven through its `capium` bash wrapper (executable_path), which
adds the GL/Metal backend, geoip, font, bluetooth/share and storage-quota flags per platform.
This module only builds the *fingerprint-level* Chrome flags and locates that wrapper.

Design note (why no Patchright): capium's own source patches make vanilla Playwright stealthy --
  001 (disable Runtime.enable console-reporting)  -> FingerprintJS developer_tools = false
  009 (webdriver)                                 -> navigator.webdriver = false
so we launch with plain Playwright and let the binary do the CDP hardening.
"""
import glob
import os
import random
import shutil

# Chrome flags that make an automated launch look like a normal user session. These are
# fingerprint-level; the bash wrapper adds the platform/GL/geoip/font/bluetooth/storage flags.
def get_default_stealth_args(seed=None, platform="windows", screen=(1440, 900)):
    """Return the default per-launch fingerprint flags.

    seed:     int identity seed (a stable, coherent device per seed). Random if None.
    platform: "windows" | "macos" | "linux" -- the spoofed OS persona.
    screen:   (width, height) for the spoofed screen AND the browser window, kept
              equal so screen == window == viewport. Pass None to skip (rely on the
              seed's device screen + fit_window; only coherent on a real display).
    """
    args = []
    if seed is not None:
        args.append("--fingerprint=%d" % int(seed))
        if platform:
            args.append("--fingerprint-platform=%s" % platform)
        # Storage quota: navigator.storage.estimate().quota otherwise reports the real
        # host disk -- a VM/fingerprint tell (e.g. a 10 GB container), and on Windows it
        # is UNSPOOFED because no bash wrapper runs there (chrome.exe is launched direct).
        # Emit the SAME per-seed 128-576 GB SSD-like value the POSIX `capium` wrapper
        # derives, so the quota is spoofed coherently on EVERY platform. On Linux/macOS the
        # wrapper sees this flag (HAVE_QUOTA=1) and defers to it rather than adding its own.
        args.append("--fingerprint-storage-quota=%d" % (128 + (int(seed) % 8) * 64))
    args += [
        # Allow third-party cookies (reCAPTCHA/login flows need them). capium blocks 3p cookies
        # by DEFAULT (fpc sets CookieControlsMode=kBlockThirdParty); --fingerprint-allow-3p-cookies
        # is the WIRED switch that sets CookieControlsMode=kOff (verified in cookie_settings.cc).
        # We keep --disable-features=TrackingProtection3pcd too (belt-and-suspenders / other path).
        "--fingerprint-allow-3p-cookies",
        "--disable-features=TrackingProtection3pcd",
        # present a desktop mouse (fine pointer + hover), not a touch device
        "--blink-settings=primaryHoverType=2,availableHoverTypes=2,"
        "primaryPointerType=4,availablePointerTypes=4",
        "--no-first-run",
        "--no-default-browser-check",
    ]
    # Patch 001 makes developer_tools always false, which unmasks FingerprintJS's
    # tampering ML: per-seed canvas/audio NOISE would then read as tampering, so
    # default it OFF (measured clean: tampering=false, ml~0.05, anti_detect=false).
    # Trade-off: personas on the same host share its real canvas (no per-seed canvas
    # uniqueness) -- pass --fingerprint-noise=true to restore it (accepts tampering).
    args.append("--fingerprint-noise=false")
    # A Windows persona's font metrics must match real Windows (needs Windows fonts
    # present on the host); harmless elsewhere, so gate it to the windows persona.
    if platform == "windows":
        args.append("--fingerprint-windows-font-metrics")
    # Screen/viewport coherence: in a headless container the persona's seed-derived
    # screen (e.g. 2560x1080) mismatches the actual small browser viewport (e.g.
    # 945x939) -- browserscan flags "screen dimensions don't match viewport" as a
    # virtual machine. Pin the spoofed screen to a window we also size, so
    # screen == window == viewport in every environment (headless/container too),
    # since the --window-size flag applies at launch without a window manager.
    if screen:
        sw, sh = int(screen[0]), int(screen[1])
        args.append("--window-size=%d,%d" % (sw, sh))
        args.append("--fingerprint-screen-width=%d" % sw)
        args.append("--fingerprint-screen-height=%d" % sh)
    return args


def new_seed():
    """A fresh random identity seed."""
    return random.randint(1, 2**31 - 1)


# ---- binary / wrapper discovery -------------------------------------------------------------
# The launch target (handed to Playwright as executable_path) differs by OS:
#   * POSIX (Linux/macOS): the `capium` bash wrapper -- it adds the GL/geoip/font flags and
#     execs the real `chrome` engine beside it.
#   * Windows: no wrapper ships; `chrome.exe` is launched directly (the persona flags the SDK
#     passes are enough, and WebGL uses the host GPU).
# Distros extract as a `capium-<version>-<platform>/` directory (tar) or, on Windows, flat --
# the downloader normalizes both into a `capium-*` directory, and discovery GLOBS for those
# rather than pinning version numbers, so a new Chromium version needs no code change here.

# The engine binaries the wrapper spawns; they need +x alongside the wrapper itself.
_EXEC_SIBLINGS = ("chrome", "chrome_crashpad_handler", "chrome_sandbox", "chrome-sandbox")


def _wrapper_names():
    """Launch-target filenames to look for, in priority order, for this OS."""
    if os.name == "nt":
        return ("capium.exe", "capium.bat", "capium", "chrome.exe")
    return ("capium",)


def _is_capium_dir(d):
    """True if `d` holds a capium distro (marker files present), so a generic `chrome.exe`
    found there is ours and not an unrelated system Chrome install."""
    return (os.path.isdir(os.path.join(d, "capium_fonts"))
            or os.path.isfile(os.path.join(d, "BUILD_INFO.txt")))


def _ensure_executable(path):
    """Best-effort `chmod +x` on the wrapper and the engine binaries it spawns (POSIX only).

    Vendoring the distro through git-on-Windows, a .zip, an npm package, or a Docker COPY
    routinely strips the Unix execute bit -- which makes Playwright fail to launch with the
    opaque `spawn <path> EACCES`. Self-heal it so a dropped permission bit isn't a hard stop.
    Returns True if `path` is executable afterwards. No-op on Windows (no +x concept)."""
    if os.name != "posix":
        return True
    d = os.path.dirname(path)
    for t in [path] + [os.path.join(d, s) for s in _EXEC_SIBLINGS]:
        try:
            if os.path.isfile(t):
                os.chmod(t, os.stat(t).st_mode | 0o111)  # +x for user/group/other
        except OSError:
            pass
    return os.access(path, os.X_OK)


def find_binary(binary=None):
    """Locate the capium launch target (handed to Playwright as executable_path).

    Search order: the explicit `binary` arg, then `CAPIUM_BINARY`, then -- under `CAPIUM_HOME`,
    the package's parent, the package dir, and the CWD -- a flat layout (`<base>/<name>`) or any
    extracted `capium-*/` distro directory (newest first), then PATH. On Windows the target is
    `chrome.exe`, accepted only next to capium marker files so a system Chrome isn't picked up.

    A candidate that exists but isn't executable is repaired in place (chmod +x) rather than
    skipped -- a vendored distro losing its execute bit is a deployment slip, not a missing file.
    """
    names = _wrapper_names()
    here = os.path.dirname(os.path.abspath(__file__))
    bases = []
    if os.environ.get("CAPIUM_HOME"):
        bases.append(os.environ["CAPIUM_HOME"])
    bases += [os.path.dirname(here), here, os.getcwd()]

    # (path, containing_dir) so a bare chrome.exe can be checked for capium markers.
    cands = []
    for explicit in (binary, os.environ.get("CAPIUM_BINARY")):
        if explicit:
            cands.append((explicit, os.path.dirname(os.path.abspath(explicit))))
    for base in bases:
        for nm in names:
            cands.append((os.path.join(base, nm), base))          # flat: <base>/<name>
        for d in sorted(glob.glob(os.path.join(base, "capium-*")), reverse=True):
            if os.path.isdir(d):                                   # extracted distro dir
                for nm in names:
                    cands.append((os.path.join(d, nm), d))
    for nm in names:                                              # PATH -- wrapper only,
        if nm.lower() == "chrome.exe":                           # never a system chrome.exe
            continue
        onpath = shutil.which(nm)
        if onpath:
            cands.append((onpath, os.path.dirname(onpath)))

    found_but_unusable = []
    seen = set()
    for path, base_dir in cands:
        if not path:
            continue
        ap = os.path.abspath(path)
        if ap in seen or not os.path.isfile(ap):
            continue
        seen.add(ap)
        # Guard a bare chrome.exe: only ours if its dir carries capium markers.
        if os.path.basename(ap).lower() == "chrome.exe" and not _is_capium_dir(base_dir):
            continue
        if _ensure_executable(ap) or os.access(ap, os.X_OK):
            return ap
        found_but_unusable.append(ap)
    if found_but_unusable:
        f = found_but_unusable[0]
        raise PermissionError(
            "found the capium binary at %s but it is not executable and `chmod +x` did not "
            "stick. Run `chmod +x %s` (and the chrome/chrome_crashpad_handler beside it). If it "
            "sits on a noexec mount (common in containers), relocate it to an exec-enabled path."
            % (f, f))
    raise FileNotFoundError(
        "capium binary not found. Set CAPIUM_BINARY=/path/to/<capium|chrome.exe>, put the distro "
        "next to the package or under CAPIUM_HOME, or add it to PATH.")
