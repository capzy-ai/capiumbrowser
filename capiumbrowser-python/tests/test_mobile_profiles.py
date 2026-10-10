"""Mobile-only selection and native emulation options must not change desktops."""
import asyncio
from types import SimpleNamespace

import pytest

from capiumbrowser import config
from capiumbrowser.browser import _apply_viewport_defaults, _build_args
from capiumbrowser.mobile import android_profile, context_options, validate_launch


def test_complete_2022_or_newer_presets_and_unsigned_seed_selection():
    expected = [("Pixel 7", "13", 412, 915, 2.625),
                ("Pixel 8", "14", 412, 915, 2.625),
                ("Pixel 8 Pro", "14", 448, 997, 3.0),
                ("Pixel 8a", "14", 412, 915, 2.625),
                ("Pixel 9", "14", 412, 924, 2.625)]
    for seed, row in enumerate(expected):
        profile = android_profile(seed)
        assert profile["release_year"] >= 2022
        assert tuple(profile[k] for k in ("model", "platform_version", "width", "height", "dpr")) == row
        assert android_profile(seed + 100000) == profile
    assert android_profile(0xFFFFFFFF) == android_profile(0)
    profile["model"] = "mutated"
    assert android_profile(4)["model"] == "Pixel 9"


@pytest.mark.parametrize("seed", [None, True, -1, 1.5, "1", 0x100000000])
def test_invalid_mobile_seed_is_rejected(seed):
    with pytest.raises(ValueError):
        android_profile(seed)


def test_mobile_launch_has_one_phone_window_and_no_desktop_quota_or_mouse():
    for headless in (True, False):
        args = _build_args(2, "android", True, None, None, None, None, headless=headless)
        assert [a for a in args if a.startswith("--window-size=")] == ["--window-size=448,997"]
        assert "--fingerprint-platform=android" in args
        assert "--touch-events=enabled" in args
        assert not any(a.startswith("--fingerprint-storage-quota=") for a in args)
        assert "--fingerprint-windows-font-metrics" not in args
        assert "primaryPointerType=4" not in " ".join(args)
        assert "--window-size=800,600" not in args
    assert config.get_default_stealth_args(2, "android", (400, 900))[-2:] == [
        "--fingerprint-screen-width=400", "--fingerprint-screen-height=900"]


@pytest.mark.parametrize("asynchronous", [False, True])
def test_all_plain_launch_context_creation_paths_use_mobile_options(asynchronous):
    def sync_method(**options):
        return options

    async def async_method(**options):
        return options

    method = async_method if asynchronous else sync_method
    browser = _apply_viewport_defaults(SimpleNamespace(new_context=method, new_page=method),
                                      asynchronous=asynchronous, mobile_seed=2)
    for name in ("new_context", "new_page"):
        result = getattr(browser, name)()
        if asynchronous:
            result = asyncio.run(result)
        assert result == context_options(2)
        assert result["viewport"] == {"width": 448, "height": 997}
        assert result["is_mobile"] and result["has_touch"]


def test_explicit_context_options_are_honored_without_mutation():
    given = {"viewport": {"width": 400, "height": 800}, "has_touch": False}
    result = context_options(2, given)
    assert result["viewport"] == given["viewport"] and not result["has_touch"]
    assert "device_scale_factor" not in given
    assert context_options(2, {"no_viewport": True}) == {"no_viewport": True}


@pytest.mark.parametrize("asynchronous", [False, True])
@pytest.mark.parametrize("ua", ["", "Mozilla/5.0 ROBLOX Android App 2.741.1062",
    "Mozilla/5.0 (Linux; Android 9; Pixel 7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36"])
def test_android_context_ua_override_fails_before_driver_context_creation(asynchronous, ua):
    calls = []

    def sync_method(**options):
        calls.append(options)

    async def async_method(**options):
        calls.append(options)

    method = async_method if asynchronous else sync_method
    browser = _apply_viewport_defaults(SimpleNamespace(new_context=method, new_page=method),
                                      asynchronous=asynchronous, mobile_seed=0)
    for name in ("new_context", "new_page"):
        with pytest.raises(ValueError, match="matching Client Hints"):
            result = getattr(browser, name)(user_agent=ua, no_viewport=True)
            if asynchronous:
                asyncio.run(result)
    assert calls == []


def test_release_mobile_profile_allows_download_and_rejects_conflicting_identity(monkeypatch):
    monkeypatch.delenv("CAPIUM_BINARY", raising=False)
    validate_launch("android", None)
    validate_launch("android", "development-chrome")
    with pytest.raises(ValueError, match="identity overrides"):
        validate_launch("android", "development-chrome", ["--user-agent=desktop"])
    with pytest.raises(ValueError, match="identity overrides"):
        validate_launch("android", "development-chrome", ["--fingerprint-platform", "windows"])
    with pytest.raises(ValueError, match="stealth_args"):
        validate_launch("android", "development-chrome", stealth_args=False)
    with pytest.raises(ValueError, match='platform="android"'):
        validate_launch("Android", "development-chrome")
    validate_launch("windows", None, ["--user-agent=custom"])


@pytest.mark.parametrize("device,expected", [
    ("samsung-galaxy-a55", ("SM-A556B", "14", 360, 800, 2.25)),
    ("pixel-9-pro", ("Pixel 9 Pro", "14", 427, 952, 3.0)),
    ("pixel-9-pro-xl", ("Pixel 9 Pro XL", "14", 448, 997, 3.0)),
])
def test_explicit_device_keeps_model_os_screen_dpr_together(device, expected):
    for seed in (0, 2, 0xFFFFFFFF):
        p = android_profile(seed, device)
        assert tuple(p[k] for k in ("model", "platform_version", "width", "height", "dpr")) == expected
        assert p['id'] == device
        args = _build_args(seed, 'android', True, None, None, None, None,
                           headless=True, mobile_device=device)
        assert '--fingerprint-mobile-device=' + device in args
        assert [a for a in args if a.startswith('--window-size=')] == [f'--window-size={p["width"]},{p["height"]}']
        opts = context_options(seed, device=device)
        assert opts['viewport'] == {'width': p['width'], 'height': p['height']}
        assert opts['device_scale_factor'] == p['dpr']


@pytest.mark.parametrize('device', ['', 'Samsung', 'SM-A556B', '__proto__', 0, True, {}, []])
def test_unknown_device_is_rejected_before_launch(device):
    with pytest.raises(ValueError, match='catalog ID'):
        validate_launch('android', 'development-chrome', mobile_device=device)


def test_device_selector_cannot_leak_into_desktop_or_extra_flags():
    with pytest.raises(ValueError, match='requires platform'):
        validate_launch('windows', 'development-chrome', mobile_device='samsung-galaxy-a55')
    with pytest.raises(ValueError, match='identity overrides'):
        validate_launch('android', 'development-chrome', ['--fingerprint-mobile-device=pixel-7'])


@pytest.mark.parametrize('asynchronous', [False, True])
def test_explicit_device_reaches_all_plain_context_paths(asynchronous):
    def sync_method(**options): return options
    async def async_method(**options): return options
    method = async_method if asynchronous else sync_method
    browser = _apply_viewport_defaults(SimpleNamespace(new_context=method, new_page=method),
        asynchronous=asynchronous, mobile_seed=2, mobile_device='samsung-galaxy-a55')
    for name in ('new_context', 'new_page'):
        result = getattr(browser, name)()
        if asynchronous: result = asyncio.run(result)
        assert result == context_options(2, device='samsung-galaxy-a55')
