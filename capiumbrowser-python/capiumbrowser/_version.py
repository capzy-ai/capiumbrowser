"""Version of the capium Python SDK (independent of the browser binary version).

The SDK version and the Capium/Chromium binary version move on separate cadences: you update
the SDK with `pip install -U capiumbrowser`, and the SDK fetches the *default* binary build to
match. Crucially that default is **per platform** -- each OS/arch reaches a stable Capium build
independently (Windows can sit on 150 while macOS is on 151).

The stable build for each OS is not hardcoded here; it comes from `channels.json`, which ships
inside the wheel and is the single source of truth (the release pipeline edits that file to
promote an OS to a new stable, and the same file is published to the download server). This
module just loads it; `_FALLBACK_VERSIONS` is used only if the bundled manifest is missing or
corrupt in an install.

Override order at download time: CAPIUM_VERSION env > per-OS stable from channels.json.
"""
import json
import os
import platform as _platform

__version__ = "1.0.5"

# Used only if channels.json can't be read (corrupt/removed install). ensure_binary() raises a
# clear error long before the "unsupported platform" case matters; this keeps lookups total.
_FALLBACK_VERSIONS = {
    "windows-x64": "152.0.7977.65",  # real Chrome 152 stable per OS (win/mac .65, linux .64)
    "macos-arm64": "152.0.7977.65",
    "linux-x64":   "152.0.7977.64",
    "linux-arm64": "152.0.7977.64",  # declared; not yet published (see channels.json)
}
_DEFAULT_BINARY_VERSION = "152.0.7977.65"


def _load_stable():
    """The `channels.stable` map from the bundled manifest, or None if unreadable."""
    path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "channels.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)["channels"]["stable"]
    except (OSError, ValueError, KeyError, TypeError):
        return None


_STABLE = _load_stable()


def _versions_from_manifest():
    if not _STABLE:
        return dict(_FALLBACK_VERSIONS)
    out = {tag: e["version"] for tag, e in _STABLE.items() if isinstance(e, dict) and e.get("version")}
    return out or dict(_FALLBACK_VERSIONS)


# Default stable Capium binary build per distro tag, resolved from channels.json.
CAPIUM_BINARY_VERSIONS = _versions_from_manifest()


def binary_version_for(tag):
    """The current stable Capium binary version for a distro tag (e.g. 'windows-x64')."""
    return CAPIUM_BINARY_VERSIONS.get(tag, _DEFAULT_BINARY_VERSION)


def _revisions_from_manifest():
    if not _STABLE:
        return {}
    return {tag: int(e["revision"]) for tag, e in _STABLE.items()
            if isinstance(e, dict) and isinstance(e.get("revision"), int)}


# Re-spin variant per tag (>=1). Same Chromium `version` can be rebuilt (a stealth/fingerprint
# change with no engine bump); each re-spin increments this. 1 = the base build.
CAPIUM_BINARY_REVISIONS = _revisions_from_manifest()


def binary_revision_for(tag):
    """The re-spin variant (>=1) for a distro tag. 1 = the base build served from the
    suffix-less folder; 2,3,... are re-spins of the SAME Chromium version served from
    chromium-v<version>-r<N>/ (so a re-spin never overwrites the base artifact on R2).

    A re-spin (r2, r3, ...) is the exception -- a stealth/fingerprint change on an unchanged
    engine. The normal path forward is a Chromium version bump, which yields a fresh
    chromium-v<newversion>/ base folder on its own (revision resets to 1)."""
    return CAPIUM_BINARY_REVISIONS.get(tag, 1)


def build_id(version, revision):
    """Stable identity of one specific build = the R2 folder discriminator.

    revision 1 -> the version itself (chromium-v<version>/, no suffix -- the base build);
    revision N>=2 -> '<version>-r<N>' (chromium-v<version>-r<N>/, a same-engine re-spin).
    Used for BOTH the download folder and the install-cache key, so a revision bump on an
    unchanged Chromium version still re-downloads instead of reusing the stale base build."""
    try:
        n = int(revision)
    except (TypeError, ValueError):
        n = 1
    return version if n < 2 else "%s-r%d" % (version, n)


def is_published(tag):
    """False only when the manifest declares the tag but marks it not-yet-published. Unknown
    tags / missing manifest return True so the download layer's own error/404 speaks instead."""
    if not _STABLE:
        return True
    entry = _STABLE.get(tag)
    if not isinstance(entry, dict):
        return True
    return bool(entry.get("published", True))


def _host_tag():
    """Best-effort distro tag for the current host, mirroring licensing/download.py's mapping.
    Kept dependency-free (no import of download.py) so _version stays importable in isolation."""
    s = _platform.system().lower()
    os_ = "macos" if s == "darwin" else ("windows" if s == "windows" else "linux")
    m = _platform.machine().lower()
    arch = "x64" if m in ("x86_64", "amd64", "x64") else ("arm64" if m in ("arm64", "aarch64") else m)
    return "%s-%s" % (os_, arch)


# The stable build this SDK targets for THIS host. Kept as a module constant for backward
# compatibility (CLI display, examples). Code that fetches a build should prefer
# binary_version_for(tag) with the tag it already resolved.
CAPIUM_BINARY_VERSION = binary_version_for(_host_tag())
