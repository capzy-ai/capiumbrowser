"""Enforce the VERSION-BUMP invariant automatically: the FOUR C++ version tables must agree on
the current major's per-platform build. A drift between them is exactly what caused the UA-CH
leaks (stale pool; seed-parity patch flip). See docs/VERSION-BUMP.md.

Parses the source tree, so it's skipped when only the SDK wheel is installed (no src/).
"""
import os
import re

import pytest

_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_FP_DATA = os.path.join(_REPO, "src", "components", "ungoogled", "fingerprint_data.h")
_UAUTILS = os.path.join(_REPO, "src", "components", "embedder_support", "user_agent_utils.cc")
_INC = os.path.join(_REPO, "src", "third_party", "blink", "common", "user_agent",
                    "capium_chrome_versions.inc")

pytestmark = pytest.mark.skipif(
    not (os.path.isfile(_FP_DATA) and os.path.isfile(_UAUTILS) and os.path.isfile(_INC)),
    reason="C++ source tree not present (SDK-only checkout)")


def _read(p):
    with open(p, encoding="utf-8", errors="replace") as f:
        return f.read()


def _const(text, name):
    m = re.search(rf'{name}\s*=\s*"([\d.]+)"', text)
    assert m, f"{name} not found"
    return m.group(1)


def _major(v):
    return v.split(".")[0]


def test_per_platform_tables_agree_on_current_major():
    fp = _read(_FP_DATA)
    win = _const(fp, "kChromeVersionWindows")
    mac = _const(fp, "kChromeVersionMacOS")
    lin = _const(fp, "kChromeVersionLinux")
    major = _major(win)

    # fingerprint_data.h internal coherence: all three share the current major.
    assert _major(mac) == major and _major(lin) == major, \
        f"per-platform majors disagree: win={win} mac={mac} linux={lin}"

    # kChromiumVersions[0] (non-Chrome-brand fallback) must be the Windows published build.
    pool = re.search(r"kChromiumVersions\[\]\s*=\s*\{([^}]*)\}", fp, re.S)
    assert pool, "kChromiumVersions[] not found"
    first = re.findall(r'"([\d.]+)"', pool.group(1))[0]
    assert first == win, f"kChromiumVersions[0] {first} != kChromeVersionWindows {win}"

    # kCapiumChromeBuilds current-major row {major, win, mac, linux} must match exactly.
    row = re.search(rf'\{{\s*{major}\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}}',
                    _read(_UAUTILS))
    assert row, f"kCapiumChromeBuilds row for major {major} not found"
    assert (row.group(1), row.group(2), row.group(3)) == (win, mac, lin), \
        f"kCapiumChromeBuilds[{major}] {row.groups()} != fingerprint_data.h ({win},{mac},{lin})"

    # kStable (.inc) current-major entry -- single column = the published (win/mac) build.
    inc = re.search(rf'\{{\s*"{major}"\s*,\s*"([\d.]+)"\s*\}}', _read(_INC))
    assert inc, f"kStable entry for major {major} not found"
    assert inc.group(1) == win, \
        f"kStable[{major}] {inc.group(1)} != kChromeVersionWindows {win}"
