"""Enforce the VERSION-BUMP invariant automatically: the default constants and shared table agree on
the current major's per-platform build. A drift between them is exactly what caused the UA-CH
leaks (stale pool; seed-parity patch flip). See docs/VERSION-BUMP.md.

Parses the source tree, so it's skipped when only the SDK wheel is installed (no src/).
"""
import os
import re

import pytest

# repo root is 4 levels up: tests/ -> capiumbrowser-python/ -> capiumbrowser/ -> <repo>
_REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
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

    assert _const(fp, 'kChromeDefaultVersion') == win
    # Both native code paths include the same table and parser. A second table
    # would reintroduce the full-UA/platform/invalid-version disagreements.
    embedder = _read(_UAUTILS)
    assert 'kCapiumChromeBuilds[]' not in embedder
    assert '#include "third_party/blink/common/user_agent/capium_chrome_versions.inc"' in embedder
    assert 'CapiumChromeVersionOverride(cl)' in embedder

    # The one shared table holds all three platform columns.
    inc = re.search(rf'\{{\s*"{major}"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}}',
                    _read(_INC))
    assert inc, f"kStable entry for major {major} not found"
    assert (inc.group(1), inc.group(2), inc.group(3)) == (win, mac, lin), \
        f"kStable[{major}] {inc.groups()} != fingerprint_data.h ({win},{mac},{lin})"


def test_chrome154_override_row_is_available_on_both_native_paths():
    # Verified published builds; a historical-major override must not fall back
    # to the current 155 engine's versions when its UA has been reduced.
    row = re.search(r'\{\s*"154"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}', _read(_INC))
    assert row and row.groups() == ('154.0.8037.100', '154.0.8037.100', '154.0.8037.97')
    metadata = os.path.join(_REPO, 'src', 'third_party', 'blink', 'common', 'user_agent', 'user_agent_metadata.cc')
    for path in (_UAUTILS, metadata):
        assert '#include "third_party/blink/common/user_agent/capium_chrome_versions.inc"' in _read(path)


def test_mobile_table_present_and_current_major_has_real_build():
    """Android/iOS run a distinct patch cadence from desktop (e.g. 158: desktop win .37 vs
    Android .43 vs iOS .35), so a mobile persona must report its OWN Stable build, never the
    desktop column. The current engine major MUST carry a kStableMobile row; the resolver only
    falls back to the desktop win build when the row is absent."""
    fp = _read(_FP_DATA)
    major = _major(_const(fp, "kChromeVersionWindows"))
    inc = _read(_INC)
    assert "kStableMobile[]" in inc, "kStableMobile table missing"
    mobile = inc[inc.index("kStableMobile"):]
    row = re.search(rf'\{{\s*"{major}"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}}', mobile)
    assert row, f"kStableMobile row for current major {major} not found"
    andr, ios = row.groups()
    assert _major(andr) == major and _major(ios) == major, \
        f"mobile build majors disagree with engine: android={andr} ios={ios} (major {major})"
    # each must be a real published build (four components, not a reduced X.0.0.0)
    for b in (andr, ios):
        parts = b.split(".")
        assert len(parts) == 4 and parts[1:] != ["0", "0", "0"], f"not a real published build: {b}"


def test_157_and_158_desktop_rows_present_with_real_builds():
    """157 (spoofable historical) + 158 (158-engine target) rows carry the real Google
    VersionHistory per-platform builds, so UA string and UA-CH never disagree on those majors."""
    inc = _read(_INC)
    want = {
        "158": ("158.0.8127.37", "158.0.8127.37", "158.0.8127.36"),
        "157": ("157.0.8103.81", "157.0.8103.81", "157.0.8103.78"),
    }
    for mj, exp in want.items():
        row = re.search(rf'\{{\s*"{mj}"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}}', inc)
        assert row and row.groups() == exp, \
            f"kStable[{mj}] {row.groups() if row else None} != {exp}"
    # and their mobile rows exist too (Android/iOS real builds)
    mobile = inc[inc.index("kStableMobile"):]
    for mj, exp in {"158": ("158.0.8127.43", "158.0.8127.35"),
                    "157": ("157.0.8103.80", "157.0.8103.37")}.items():
        row = re.search(rf'\{{\s*"{mj}"\s*,\s*"([\d.]+)"\s*,\s*"([\d.]+)"\s*\}}', mobile)
        assert row and row.groups() == exp, \
            f"kStableMobile[{mj}] {row.groups() if row else None} != {exp}"
