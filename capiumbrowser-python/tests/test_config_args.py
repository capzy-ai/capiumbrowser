"""Unit tests for capiumbrowser.config.get_default_stealth_args -- the per-launch fingerprint
flags. Guards the storage-quota formula, per-persona font-metrics gating, and screen coherence.
"""
from capiumbrowser import config


def _has(args, prefix):
    return any(a == prefix or a.startswith(prefix + "=") or a.startswith(prefix) for a in args)


def test_seed_and_platform_flags():
    args = config.get_default_stealth_args(seed=12345, platform="windows", screen=None)
    assert "--fingerprint=12345" in args
    assert "--fingerprint-platform=windows" in args


def test_storage_quota_formula():
    # 128 + (seed % 8) * 64 GB. seed 12345 % 8 == 1 -> 192; seed 1000 % 8 == 0 -> 128.
    a1 = config.get_default_stealth_args(seed=12345, platform="linux", screen=None)
    assert "--fingerprint-storage-quota=192" in a1
    a2 = config.get_default_stealth_args(seed=1000, platform="linux", screen=None)
    assert "--fingerprint-storage-quota=128" in a2


def test_windows_gets_font_metrics_others_do_not():
    win = config.get_default_stealth_args(seed=1, platform="windows", screen=None)
    assert "--fingerprint-windows-font-metrics" in win
    for plat in ("macos", "linux"):
        a = config.get_default_stealth_args(seed=1, platform=plat, screen=None)
        assert "--fingerprint-windows-font-metrics" not in a


def test_noise_off_by_default():
    args = config.get_default_stealth_args(seed=1, platform="linux", screen=None)
    assert "--fingerprint-noise=false" in args


def test_screen_coherence_flags():
    args = config.get_default_stealth_args(seed=1, platform="linux", screen=(1440, 900))
    assert "--window-size=1440,900" in args
    assert "--fingerprint-screen-width=1440" in args
    assert "--fingerprint-screen-height=900" in args


def test_no_seed_omits_identity_flags():
    args = config.get_default_stealth_args(seed=None, platform="windows", screen=None)
    assert not _has(args, "--fingerprint=")
    assert not _has(args, "--fingerprint-platform")
    assert not _has(args, "--fingerprint-storage-quota")
    # non-identity defaults still present
    assert "--no-first-run" in args


def test_third_party_cookies_allowed():
    args = config.get_default_stealth_args(seed=1, platform="linux", screen=None)
    assert "--fingerprint-allow-3p-cookies" in args
