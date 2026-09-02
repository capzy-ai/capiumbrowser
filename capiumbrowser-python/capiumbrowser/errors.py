"""Typed errors, chiefly for licensing.

Enforcement lives in the browser binary; when it refuses to start it prints a
`[capium-license] ...` line to stderr and exits with a coded status. Playwright's
native launch surfaces that stderr inside its own launch error — `translate_launch_error`
turns it into a precise, actionable capium exception.
"""


class CapiumError(Exception):
    """Base class for capium SDK errors."""


class CapiumLicenseError(CapiumError):
    """The browser refused to start for a licensing reason."""


class CapiumConfigError(CapiumLicenseError):
    """No license key configured."""


class CapiumSeatLimitError(CapiumLicenseError):
    """Concurrent session limit reached across the owner's machines."""


class CapiumExpiredError(CapiumLicenseError):
    """License expired, revoked, or the key is invalid."""


class CapiumServerDownError(CapiumLicenseError):
    """License service unreachable and no valid offline grace."""


def _clean(msg: str) -> str:
    """Pull the '[capium-license] ...' line out of a noisy launch error, if present."""
    for line in msg.splitlines():
        if "[capium-license]" in line:
            return line.split("[capium-license]", 1)[1].strip()
    return msg.strip()


def translate_launch_error(exc: Exception):
    """Map a Playwright launch failure to a typed license error when the browser's
    fail-closed stderr is recognizable. Returns a new exception to raise, or None
    if this isn't a licensing failure (caller should re-raise the original)."""
    low = str(exc).lower()
    if "capium-license" not in low and "no license configured" not in low:
        return None
    hint = _clean(str(exc))
    if "no license configured" in low:
        return CapiumConfigError(
            f"{hint}\nSet CAPIUM_LICENSE_KEY, pass license_key=..., or create "
            f"~/.capium/license (KEY=). Run `capium status` to check.")
    if "session limit" in low or "concurrent session" in low:
        return CapiumSeatLimitError(f"{hint} — close another Capium browser and retry.")
    if "rejected" in low or "expired" in low or "revoked" in low:
        return CapiumExpiredError(hint)
    if "unreachable" in low or "offline grace" in low:
        return CapiumServerDownError(hint)
    return CapiumLicenseError(hint)


# Exit codes written by the binary's fail-closed path (capium_license_main_extra_parts.cc).
_STATUS_CODES = {
    "2": CapiumConfigError,     # kExitNoLicense
    "3": CapiumSeatLimitError,  # kExitSeatLimit
    "4": CapiumExpiredError,    # kExitExpired (expired / revoked / bad key)
    "5": CapiumServerDownError, # kExitServerDown
}


def read_launch_status(path):
    """Turn the binary's fail-closed status file into a typed exception, or None.

    On a licensing fail-closed the binary writes "<exit_code>\\n<message>" to the path
    the SDK handed it via CAPIUM_LICENSE_STATUS_FILE. Reading THAT is how we surface a
    precise error from the binary's OWN single verification -- no second server call, and
    reliable where Playwright's stderr relay (translate_launch_error) isn't. Returns None
    when the file is absent/empty (old binary that doesn't write it -> stderr fallback).
    """
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            raw = f.read()
    except OSError:
        return None
    if not raw.strip():
        return None
    code, _, msg = raw.partition("\n")
    msg = msg.strip() or "the browser refused to start for a licensing reason"
    return _STATUS_CODES.get(code.strip(), CapiumLicenseError)(msg)
