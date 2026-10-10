import json
from pathlib import Path
import subprocess
import sys

import pytest

from capiumbrowser import config
from capiumbrowser.desktop import brand_args, normalize_brand, profile, validate_launch


@pytest.mark.parametrize("brand", ["edge", "opera", "vivaldi"])
@pytest.mark.parametrize("platform", ["windows", "macos", "linux"])
def test_brand_only_adds_explicit_selection(brand, platform):
    original = config.get_default_stealth_args(40100, platform)
    assert config.get_default_stealth_args(40100, platform, browser_brand=brand) == original + ["--fingerprint-brand=" + brand]
    assert config.get_default_stealth_args(40100, platform, browser_brand="CHROME") == original


@pytest.mark.parametrize("brand", ["edge", "opera", "vivaldi"])
def test_brand_is_desktop_only_and_allows_release_download(brand, monkeypatch):
    monkeypatch.delenv("CAPIUM_BINARY", raising=False)
    with pytest.raises(ValueError, match="desktop platform"):
        config.get_default_stealth_args(2, "android", browser_brand=brand)
    validate_launch(brand, "windows", None, [], True)
    with pytest.raises(ValueError, match="stealth_args"):
        validate_launch(brand, "linux", "preview", [], False)
    validate_launch(brand, "macos", "preview", [], True)


@pytest.mark.parametrize("flag", ["--user-agent=X", "--fingerprint-brand=opera", "--fingerprint-brand-version=155", "--fingerprint-platform=android", "--fingerprint-brand"])
def test_conflicting_native_identity_overrides_are_rejected(flag):
    with pytest.raises(ValueError, match="conflicting identity"):
        validate_launch("edge", "windows", "preview", [flag], True)


@pytest.mark.parametrize("brand", ["firefox", "", " opera ", 155, {}])
def test_unknown_brands_are_rejected(brand):
    with pytest.raises(ValueError, match="browser_brand"):
        normalize_brand(brand)


def test_current_verified_versions_and_chrome_mobile_defaults():
    assert profile("EDGE")["product_version"] == "155.0.4283.45"
    assert profile("edge")["chromium_version"] == "155.0.8059.40"
    assert profile("opera")["product_version"] == "137.0.6036.39"
    assert profile("opera")["chromium_version"] == "153.0.8010.55"
    assert profile("vivaldi")["hint_brand"] == "Google Chrome"
    assert profile("vivaldi")["chromium_version"] == "152.0.7977.160"
    assert profile("vivaldi")["ua_suffix"] == ""
    assert brand_args(None, "android") == []
    assert config.get_default_stealth_args(2, "android", browser_brand="chrome") == config.get_default_stealth_args(2, "android")


def test_generated_versions_match_authority():
    root = Path(__file__).resolve().parents[3]
    generator = root / "tools/generate_browser_brands.py"
    if not generator.exists():
        pytest.skip("SDK-only checkout")
    subprocess.run([sys.executable, str(generator), "--check"], check=True)
    source = json.loads((root / "data/desktop/browser-brands.json").read_text(encoding="utf-8"))
    assert source == json.loads((root / "capiumbrowser/capiumbrowser-node/lib/browser-brands.json").read_text(encoding="utf-8"))
