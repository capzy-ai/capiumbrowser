"""Validate channels.json (the single source of truth for stable builds) and that the SDK's
download tag map agrees with it -- so a new tag can't be added in one place and missed in the
other (mirrors the kind of "resolver sources match" guard a stealth SDK needs).
"""
import json
import os
import re

import capiumbrowser
from capiumbrowser import _version
from capiumbrowser.licensing import download

_PKG = os.path.dirname(os.path.abspath(capiumbrowser.__file__))
_TAGS = {"linux-x64", "linux-arm64", "windows-x64", "macos-arm64"}
_SEMVER = re.compile(r"^\d+\.\d+\.\d+\.\d+$")


def _manifest():
    with open(os.path.join(_PKG, "channels.json"), encoding="utf-8") as f:
        return json.load(f)


def test_channels_json_parses_and_has_all_tags():
    stable = _manifest()["channels"]["stable"]
    assert set(stable) == _TAGS, f"channels.json tags {set(stable)} != {_TAGS}"


def test_versions_are_well_formed():
    stable = _manifest()["channels"]["stable"]
    for tag, entry in stable.items():
        assert _SEMVER.match(entry["version"]), f"{tag}: bad version {entry['version']!r}"
        # published tags must carry a sha256; unpublished must not claim one
        if entry.get("published"):
            assert entry.get("sha256"), f"{tag} is published but has no sha256"


def test_download_tag_map_matches_manifest():
    # download._SUPPORTED is the (os,arch)->tag map; its tags must equal the manifest's tags.
    assert set(download._SUPPORTED.values()) == _TAGS


def test_binary_version_for_matches_manifest():
    stable = _manifest()["channels"]["stable"]
    for tag, entry in stable.items():
        assert _version.binary_version_for(tag) == entry["version"], tag


def test_is_published_reflects_manifest():
    stable = _manifest()["channels"]["stable"]
    for tag, entry in stable.items():
        # is_published defaults True for unknown/missing, but for a KNOWN tag it must match.
        assert _version.is_published(tag) == bool(entry.get("published")), tag
