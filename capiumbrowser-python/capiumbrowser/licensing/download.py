"""
capiumbrowser.licensing.download -- fetch/extract the per-platform Capium binary if it isn't
already present.

The Python SDK and the browser binary are decoupled: update Playwright with pip, and fetch the
matching Capium build separately. If the launch target isn't found locally, ensure_binary()
downloads the per-platform tarball and extracts it next to the package.

Download scheme (signed, path-based):
    GET {server}/download/distro/chromium-v{version}/capiumbrowser-{os}-{arch}.tar.gz

The license key travels in the X-Capzy-License header (over TLS), NEVER in the URL; the request
PATH is HMAC-signed (X-Capzy-Timestamp + X-Capzy-Signature = HMAC-SHA256(key, "<ts>.<path>")) —
the same scheme as the licensing calls. The response's X-Capzy-SHA256 is verified against the
downloaded bytes before anything is extracted.

The archive FILENAME is version-independent -- `capiumbrowser-<os>-<arch>.tar.gz` is always the
same; only the `chromium-v<version>/` folder changes.

Source resolution (first that works):
    CAPIUM_BINARY            -> use this exact launch target, no download
    CAPIUM_DOWNLOAD_URL      -> a direct .tar.gz URL (may contain {platform}/{version}); unsigned escape hatch
    license server           -> the signed GET above

Supported platforms (the four capium publishes):
    linux-x64   linux-arm64   windows-x64   macos-arm64
Anything else (macOS Intel, Windows ARM, ...) raises a clear CapiumError.
"""
import glob
import hashlib
import os
import platform as _platform
import shutil
import tarfile
import tempfile
import urllib.error
import urllib.request
import zipfile

from . import client as _license
from ..errors import CapiumError, CapiumExpiredError, CapiumServerDownError
from .._version import binary_version_for, is_published

_CHUNK = 1 << 16
_NET_TIMEOUT = 300

# (normalized os, normalized arch) -> distro tag used in the filename/URL.
_SUPPORTED = {
    ("linux", "x64"): "linux-x64",
    ("linux", "arm64"): "linux-arm64",
    ("windows", "x64"): "windows-x64",
    ("macos", "arm64"): "macos-arm64",
}


def _norm_os(sysname):
    s = sysname.lower()
    if s == "darwin":
        return "macos"
    if s == "windows":
        return "windows"
    return "linux"


def _norm_arch(mach):
    m = mach.lower()
    if m in ("x86_64", "amd64", "x64"):
        return "x64"
    if m in ("arm64", "aarch64"):
        return "arm64"
    return m


def download_tag(system=None, machine=None):
    """The distro tag for THIS host -- one of linux-x64, linux-arm64, windows-x64, macos-arm64.

    Raises CapiumError for a platform capium doesn't publish (e.g. macOS Intel, Windows ARM)."""
    os_ = _norm_os(system or _platform.system())
    arch = _norm_arch(machine or _platform.machine())
    tag = _SUPPORTED.get((os_, arch))
    if not tag:
        raise CapiumError(
            "capium has no build for this platform: %s/%s (%s %s). Supported: %s."
            % (os_, arch, system or _platform.system(), machine or _platform.machine(),
               ", ".join(sorted(_SUPPORTED.values()))))
    return tag


def distro_path(version, tag):
    """The signed request path for a build. Filename is version-independent; only the folder
    carries the version (per the '...end name will all be the same' contract)."""
    return "/download/distro/chromium-v%s/capiumbrowser-%s.tar.gz" % (version, tag)


# ---- extraction ------------------------------------------------------------------------------

def _dest_root():
    """Where extracted distros live (next to the package by default)."""
    pkg_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.environ.get("CAPIUM_HOME") or pkg_dir


def _single_top(names):
    """True if every archive entry sits under ONE common top-level directory (the tar layout,
    e.g. `capium-151-linux-x64/...`). False for a FLAT archive (a Windows zip whose `chrome.exe`
    / `locales/` sit at the root)."""
    top = None
    for n in names:
        n = n.replace("\\", "/").strip("/")
        if not n:
            continue
        first = n.split("/")[0]
        if top is None:
            top = first
        elif first != top:
            return False
    return top is not None


def _extract(path, root, subdir):
    """Extract a distro archive, sniffing gzip/zip/tar so the server can ship any of them. A
    single-top archive extracts into `root` (it carries its own `capium-*/` dir); a FLAT archive
    is wrapped into `root/<subdir>` so it stays discoverable."""
    with open(path, "rb") as f:
        magic = f.read(4)
    if magic[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(path) as z:
            dest = root if _single_top(z.namelist()) else os.path.join(root, subdir)
            z.extractall(dest)
    elif magic[:2] == b"\x1f\x8b":
        with tarfile.open(path, "r:gz") as t:
            dest = root if _single_top(t.getnames()) else os.path.join(root, subdir)
            t.extractall(dest)
    else:
        with tarfile.open(path, "r:*") as t:
            dest = root if _single_top(t.getnames()) else os.path.join(root, subdir)
            t.extractall(dest)


_MARKER = ".capium-build"


def _installed_version(binpath):
    """Read the build version stamped next to an installed binary, or None (an old install
    from before version-stamping, which we treat as 'unknown' -> upgrade it)."""
    try:
        with open(os.path.join(os.path.dirname(binpath), _MARKER)) as f:
            return f.read().strip()
    except OSError:
        return None


def installed_version(binpath=None):
    """Public: the stamped build version of the installed capium binary, or None if it isn't
    installed / wasn't version-stamped. `binpath` defaults to the discovered binary."""
    if binpath is None:
        from .. import config
        try:
            binpath = config.find_binary()
        except FileNotFoundError:
            return None
    return _installed_version(binpath)


def _stamp_version(binpath, version):
    try:
        with open(os.path.join(os.path.dirname(binpath), _MARKER), "w") as f:
            f.write(str(version))
    except OSError:
        pass


def _remove_installs(root):
    """Delete previously-extracted capium distros under `root`. A host only ever holds its own
    platform's build, so on a version change we drop the stale one before installing the new one
    ('old removed, new downloaded'). Never touches CAPIUM_BINARY / PATH targets outside `root`."""
    for d in glob.glob(os.path.join(root, "capium-*")):
        if os.path.isdir(d):
            shutil.rmtree(d, ignore_errors=True)


# ---- download --------------------------------------------------------------------------------

def _download(url, headers, dest, version, tag):
    """Stream `url` to `dest`, mapping transport failures to typed errors and verifying the
    server's X-Capzy-SHA256 against the bytes. Returns the hex sha256."""
    # The download server sits behind Cloudflare, which WAF-blocks the default "Python-urllib/x"
    # User-Agent as a bot (403). Send a browser UA unless the caller set one.
    hdrs = dict(headers or {})
    hdrs.setdefault("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                                  "(KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36")
    req = urllib.request.Request(url, headers=hdrs)
    h = hashlib.sha256()
    expected = None
    try:
        with urllib.request.urlopen(req, timeout=_NET_TIMEOUT) as resp, open(dest, "wb") as f:
            expected = resp.headers.get("X-Capzy-SHA256")
            while True:
                chunk = resp.read(_CHUNK)
                if not chunk:
                    break
                f.write(chunk)
                h.update(chunk)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            raise CapiumError(
                "no capium build published for version %s on %s (HTTP 404). Check CAPIUM_VERSION, "
                "or that this platform/version is published." % (version, tag))
        if e.code in (401, 403):
            raise CapiumExpiredError(
                "license rejected while downloading (HTTP %d) -- expired, revoked, or invalid key. "
                "Run `capium status` to check." % e.code)
        raise CapiumServerDownError("download failed: HTTP %d from %s" % (e.code, url))
    except urllib.error.URLError as e:
        raise CapiumServerDownError("could not reach the download server %s: %s" % (url, e.reason))
    got = h.hexdigest().lower()
    if expected and got != expected.lower():
        raise CapiumError(
            "capium download failed its integrity check (sha256 mismatch): expected %s, got %s "
            "(corrupted or tampered download)." % (expected.lower(), got))
    return got


def ensure_binary(version=None, license_key=None, server=None):
    """Return the path to the capium launch target, downloading + extracting the per-platform
    build if it isn't already present.

    Raises:
        CapiumError          -- unsupported platform, version/platform not published (404), or a
                                sha256 integrity failure.
        CapiumConfigError    -- no license key configured and no other source (from resolve()).
        CapiumExpiredError   -- the license was rejected (401/403).
        CapiumServerDownError-- the download server was unreachable / 5xx.
    """
    from .. import config  # local import: config imports nothing from us, keep it lazy-safe

    # An explicit CAPIUM_BINARY path always wins -- it's the caller's choice, no version check.
    if os.environ.get("CAPIUM_BINARY"):
        return config.find_binary()

    # Resolve the host's distro tag first: the default binary version is per-OS (each OS reaches
    # a stable build independently), so we can't pick a default until we know which tag we're on.
    tag = download_tag()

    # If the manifest declares this OS but hasn't marked it published, say so plainly instead of
    # letting the download 404. An explicit CAPIUM_VERSION means the caller knows a build exists,
    # so we don't gate that path.
    if version is None and not os.environ.get("CAPIUM_VERSION") and not is_published(tag):
        raise CapiumError(
            "capium has no stable build published for %s yet (declared but not yet released). "
            "Set CAPIUM_VERSION to pin a specific build if one exists." % tag)

    version = version or os.environ.get("CAPIUM_VERSION") or binary_version_for(tag)

    # Reuse the cached binary ONLY if it's already the target version. A different (older)
    # version -- e.g. after `pip install -U capiumbrowser` bumps this OS's pinned build -- falls
    # through to fetch the new build and drop the old one.
    try:
        existing = config.find_binary()
        if _installed_version(existing) == version:
            return existing
    except FileNotFoundError:
        pass

    direct = os.environ.get("CAPIUM_DOWNLOAD_URL")
    if direct:
        url, headers, path = direct.format(platform=tag, version=version), None, None
    else:
        # Signed path-based download: key in a header, PATH HMAC-signed, sha256-verified.
        key, srv = _license.resolve(license_key, server)  # -> CapiumConfigError if no key
        path = distro_path(version, tag)
        url = srv + path
        headers = _license.get_headers(key, path)

    root = _dest_root()
    os.makedirs(root, exist_ok=True)
    subdir = "capium-%s-%s" % (str(version).split(".")[0], tag)  # FLAT-archive wrapper name
    with tempfile.NamedTemporaryFile(suffix=".tar.gz", delete=False) as tf:
        tmp = tf.name
    try:
        _download(url, headers, tmp, version, tag)
        # Only drop the stale install once the new bytes are in hand (a failed download must
        # never leave the host with no binary), then extract the new version.
        _remove_installs(root)
        _extract(tmp, root, subdir)
    finally:
        try:
            os.remove(tmp)
        except OSError:
            pass

    try:
        binpath = config.find_binary()
    except FileNotFoundError:
        raise CapiumError(
            "downloaded and extracted the %s build but no launch target was found afterwards "
            "(unexpected archive layout under %s)." % (tag, root))
    _stamp_version(binpath, version)  # so a later version bump knows to re-download
    # Re-apply exec bits the wrapper + engine binaries need (zip drops unix perms).
    for p in (binpath, os.path.join(os.path.dirname(binpath), "chrome")):
        try:
            os.chmod(p, 0o755)
        except OSError:
            pass
    return binpath
