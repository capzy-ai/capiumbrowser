"""
capiumbrowser.licensing -- license resolution and the license-gated binary download.

Enforcement lives in the browser binary. This package only (a) resolves the
key/server so we can hand them to the binary and the downloader, (b) offers a
stdlib-only `status()` for the CLI, and (c) fetches the per-platform binary.

  client    -- key/server resolution, `status()`, `preflight()`, signed headers.
  download  -- `ensure_binary()`: fetch + checksum-verify the per-platform build.

`status` and the `download` module are re-exported from the top-level package
(`capiumbrowser.status`, `capiumbrowser.download`) for backward compatibility.
"""
from . import client
from . import download
from .client import (
    status,
    preflight,
    resolve,
    effective,
    child_env,
    get_headers,
    DEFAULT_SERVER,
)

__all__ = [
    "client",
    "download",
    "status",
    "preflight",
    "resolve",
    "effective",
    "child_env",
    "get_headers",
    "DEFAULT_SERVER",
]
