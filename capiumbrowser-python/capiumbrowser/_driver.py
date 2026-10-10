"""
capium._driver -- pick the Playwright-compatible driver that talks CDP to the capium binary.

Default is vanilla Playwright. ``driver="patchright"`` or
``CAPIUM_DRIVER=patchright`` selects the installed Playwright-compatible fork.
Patchright changes context acquisition, bindings and init-script delivery to
avoid Runtime.enable in its normal driver path. Its evaluation-world defaults
and API compatibility depend on the installed version; page globals and object
handles may require explicit main-context selection.

Capium's native fingerprint policies remain in C++. Driver selection can still
change observations and detector results. Development engine 155 honors the
requested execution context by default and masks page/worker console events
independently; engine 153 uses the older default isolation policy. Masking does
not remove all inspector side effects or guarantee a detector classification.
See the native inspector audit in docs/reports for measured compatibility and
site outcomes. Published SDK metadata continues to select engine 153.
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
