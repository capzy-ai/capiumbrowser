"""
License helpers for the SDK. Enforcement is in the browser binary — this module
only (a) resolves the key/server so we can pass them to the binary and the
downloader, and (b) offers a stdlib-only `status()` for the `capium status` CLI.
The SDK never holds its own seat (that would double-count one launch as two
concurrent sessions). See https://docs.capiumbrowser.com for the full model.
"""
import base64
import hashlib
import hmac
import json
import os
import platform
import socket
import subprocess
import time
import urllib.error
import urllib.request

from ..errors import CapiumConfigError, CapiumExpiredError, CapiumServerDownError
from .._version import __version__

DEFAULT_SERVER = "https://license.capzy.ai"
_LICENSE_FILE = os.path.join(os.path.expanduser("~"), ".capium", "license")
_USER_AGENT = "capiumbrowser/%s" % __version__


def _from_file():
    key = server = None
    try:
        with open(_LICENSE_FILE) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = (s.strip() for s in line.split("=", 1))
                if k.upper() == "KEY" and not key:
                    key = v
                elif k.upper() == "SERVER" and not server:
                    server = v
    except OSError:
        pass
    return key, server


def effective(key=None, server=None):
    """Resolve from explicit arg then env ONLY (no file). Used to inject into the
    browser's environment — if the key lives only in ~/.capium/license the binary
    reads that file itself, so there's nothing to inject."""
    return (key or os.environ.get("CAPIUM_LICENSE_KEY"),
            server or os.environ.get("CAPIUM_LICENSE_SERVER"))


def resolve(key=None, server=None):
    """Full resolution: arg -> env -> ~/.capium/license, defaulting the server.
    Raises CapiumConfigError if no key is found. Used by `capium status`."""
    key, server = effective(key, server)
    if not key or not server:
        fk, fs = _from_file()
        key = key or fk
        server = server or fs
    if not key:
        raise CapiumConfigError(
            "no license configured — set CAPIUM_LICENSE_KEY, pass license_key=..., "
            "or create ~/.capium/license with a KEY= line")
    return key, (server or DEFAULT_SERVER).rstrip("/")


def get_headers(key, path_and_query):
    """Signed headers for an authenticated GET (download / update). The key travels
    in a header (over TLS), never in the URL; the request target is HMAC-signed —
    same scheme as the licensing calls. `path_and_query` is exactly "<path>?<query>"."""
    ts = str(int(time.time()))
    sig = hmac.new(key.encode(), (ts + ".").encode() + path_and_query.encode(),
                   hashlib.sha256).hexdigest()
    return {"X-Capzy-License": key, "X-Capzy-Timestamp": ts, "X-Capzy-Signature": sig}


def child_env(key=None, server=None):
    """Full environment for the browser subprocess: the current env plus any
    explicitly-resolved license vars (so a key passed to launch() reaches the
    self-licensing binary without ever touching argv / `ps`)."""
    k, s = effective(key, server)
    env = dict(os.environ)
    if k:
        env["CAPIUM_LICENSE_KEY"] = k
    if s:
        env["CAPIUM_LICENSE_SERVER"] = s
    return env


def _machine_id():
    raw = None
    sysname = platform.system()
    if sysname == "Linux":
        for p in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
            try:
                raw = open(p).read().strip()
                if raw:
                    break
            except OSError:
                pass
    elif sysname == "Darwin":
        try:
            out = subprocess.check_output(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                stderr=subprocess.DEVNULL).decode()
            for line in out.splitlines():
                if "IOPlatformUUID" in line:
                    raw = line.split('"')[-2]
                    break
        except Exception:
            pass
    elif sysname == "Windows":
        try:
            import winreg
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                r"SOFTWARE\Microsoft\Cryptography") as k:
                raw = winreg.QueryValueEx(k, "MachineGuid")[0]
        except Exception:
            pass
    return raw or socket.gethostname()


def _os_name():
    return {"Windows": "windows", "Darwin": "macos"}.get(platform.system(), "linux")


def status(key=None, server=None):
    """Read license entitlements (plan, sessions_cap, live_sessions, period_end).

    Signs a read-only `activate` with the license-key HMAC using a status-scoped
    device fingerprint + a throwaway public key, so it never disturbs a running
    browser's real device enrollment and never consumes a session slot."""
    key, server = resolve(key, server)
    fp = hashlib.sha256(("capium-status:" + _machine_id()).encode()).hexdigest()
    body = json.dumps({
        "license_key": key, "device_fp": fp,
        "hostname": socket.gethostname()[:100], "os": _os_name(), "arch": "x64",
        "device_pubkey": base64.b64encode(os.urandom(32)).decode(),
    }, separators=(",", ":")).encode()
    ts = str(int(time.time()))
    sig = hmac.new(key.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        server + "/v1/activate", data=body, method="POST",
        headers={"X-Capzy-Timestamp": ts, "X-Capzy-Device-Fp": fp,
                 "X-Capzy-Signature": sig, "Content-Type": "application/json",
                 "User-Agent": _USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            data = json.loads(r.read())
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            raise CapiumExpiredError(f"license rejected ({e.code}) — expired, revoked, or invalid key")
        raise CapiumServerDownError(f"status failed: HTTP {e.code}")
    except urllib.error.URLError as e:
        raise CapiumServerDownError(f"license server unreachable at {server} ({e})")
    return {f: data.get(f) for f in
            ("plan", "sessions_cap", "live_sessions", "period_end", "heartbeat_every")}


def preflight(key=None, server=None):
    """Instant, OFFLINE no-key gate: resolve() raises CapiumConfigError if no key is set
    in arg/env/~/.capium/license, so "you forgot the license" surfaces as a typed error
    BEFORE a browser is spun up instead of an opaque Playwright "browser closed" crash.

    Deliberately does NOT hit the server. The browser binary is the SINGLE network
    verifier (activate -> session -> heartbeat); duplicating that with an SDK-side
    check would double the load on the licensing service. Expired / revoked / seat-limit
    / server-down all come back from the binary's one check and are surfaced from its
    status file via errors.read_launch_status -- no second round-trip.
    """
    resolve(key, server)        # -> CapiumConfigError when no key is configured
