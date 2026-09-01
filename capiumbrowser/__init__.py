"""
capiumbrowser -- a drop-in stealth browser SDK on top of Playwright.

    from capiumbrowser import launch, launch_context
    browser = launch(seed=42, platform="windows", headless=False)
    page = browser.new_context().new_page()
    page.goto("https://fingerprint.com/demo/")

Playwright is a normal pip dependency, so you update the engine independently:
    pip install -U playwright

The browser itself is the Capium stealth Chromium (driven via its `capium` wrapper). No
Patchright needed -- the binary's own 001/009 patches keep developer_tools/webdriver clean.

Docs: https://docs.capiumbrowser.com  ·  Site: https://capiumbrowser.com
"""
from ._version import __version__, CAPIUM_BINARY_VERSION, CAPIUM_BINARY_VERSIONS
from . import config
from .network import proxy
from . import human
from .licensing import download
from .licensing import status
from .errors import (
    CapiumError,
    CapiumLicenseError,
    CapiumConfigError,
    CapiumSeatLimitError,
    CapiumExpiredError,
    CapiumServerDownError,
)
from .browser import (
    launch,
    launch_context,
    launch_persistent_context,
)
from .browser_async import (
    launch_async,
    launch_context_async,
    launch_persistent_context_async,
)

__all__ = [
    "__version__",
    "CAPIUM_BINARY_VERSION",
    "CAPIUM_BINARY_VERSIONS",
    "config", "proxy", "human", "download", "status",
    "launch", "launch_context", "launch_persistent_context",
    "launch_async", "launch_context_async", "launch_persistent_context_async",
    "CapiumError", "CapiumLicenseError", "CapiumConfigError",
    "CapiumSeatLimitError", "CapiumExpiredError", "CapiumServerDownError",
]
