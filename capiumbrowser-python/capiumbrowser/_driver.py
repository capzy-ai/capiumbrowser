"""
capium._driver -- pick the Playwright-compatible driver that talks CDP to the capium binary.

Default is vanilla **Playwright**. Opt into **patchright** (a drop-in Playwright fork, identical
API) with ``driver="patchright"`` or ``CAPIUM_DRIVER=patchright`` to close the ``Runtime.enable``
CDP-automation leak: vanilla Playwright's driver calls ``Runtime.enable`` (10x) and evaluates in
the page's MAIN world -- a CDP signature that Runtime-domain-detecting anti-bots (DataDome, etc.)
fingerprint. Patchright never enables the Runtime domain: it acquires execution contexts via
isolated worlds (``Page.createIsolatedWorld`` + ``Runtime.addBinding{executionContextId}`` +
``Page.addScriptToEvaluateOnNewDocument``), so there is no ``Runtime.enable`` to detect.

Orthogonal to capium's stealth: ALL of capium's fingerprint spoofing lives in the C++ binary
(navigator.webdriver, device/UA/GPU/canvas, patch 001 -> developer_tools=false). The driver swap
changes only HOW the SDK drives the browser, never what the browser reports -- so patchright keeps
every binary-level spoof intact and only removes the driver-layer CDP tell.

Why opt-in (not default): on FingerprintJS **Pro**, suppressing the Runtime/devtools side-effect
can push the anti_detect_browser/tampering ML the other way (patch 001 already keeps
developer_tools=false cleanly there). So choose the driver per target -- patchright against
CDP-detecting vendors (DataDome/Kasada/...), the default elsewhere. See docs for the trade-off.
"""
import os

from .errors import CapiumError

_VALID = ("playwright", "patchright")


def driver_name(driver=None):
    """Resolve the driver: explicit arg > CAPIUM_DRIVER env > 'playwright' (default)."""
    name = (driver or os.environ.get("CAPIUM_DRIVER") or "playwright").strip().lower()
    if name not in _VALID:
        raise CapiumError(
            "unknown driver %r -- use 'playwright' (default) or 'patchright'" % name)
    return name


def _factory(name, api_module):
    """Import <pkg>.<api_module> and return it, with a clear error if patchright is missing."""
    pkg = "patchright" if name == "patchright" else "playwright"
    try:
        return __import__("%s.%s" % (pkg, api_module), fromlist=["*"])
    except ImportError as e:
        if name == "patchright":
            raise CapiumError(
                "driver='patchright' requires the patchright package. Install it with "
                "`pip install patchright` (or `pip install capiumbrowser[patchright]`). You do "
                "NOT need `patchright install` -- capium ships its own browser binary.") from e
        raise


def get_sync_playwright(driver=None):
    """The ``sync_playwright`` factory for the selected driver (drop-in for either package)."""
    return _factory(driver_name(driver), "sync_api").sync_playwright


def get_async_playwright(driver=None):
    """The ``async_playwright`` factory for the selected driver (drop-in for either package)."""
    return _factory(driver_name(driver), "async_api").async_playwright
