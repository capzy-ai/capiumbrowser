"""Experimental Android/iPhone presets, isolated from desktop identity defaults.

The catalog is shared with the native engine. Graphics, fonts, CPU and memory
remain host capabilities; these presets are not physical-device certifications.
"""
import json
from pathlib import Path

_CATALOG = json.loads(Path(__file__).with_name("android-phones.json").read_text(encoding="utf-8"))
_PROFILES = {profile["id"]: profile for profile in _CATALOG["profiles"]}
_IOS_CATALOG = json.loads(Path(__file__).with_name("ios-phones.json").read_text(encoding="utf-8"))
_IOS_PROFILES = {profile["id"]: profile for profile in _IOS_CATALOG["profiles"]}

# Evaluated on an intercepted, empty .invalid page for every mobile launch.
# No network request is sent. A secure origin exposes native UA Client Hints.
ENGINE_PROBE = r"""async expected => {
    const match = navigator.userAgent.match(/Chrome\/(\d+)\.0\.0\.0 Mobile Safari\//);
    if (!expected || navigator.platform !== 'Linux armv81' || !match ||
        !navigator.userAgent.includes('(Linux; Android 10; K)') ||
        navigator.userAgent.includes('Version/4.0') || !navigator.userAgentData) return false;
    const ch = await navigator.userAgentData.getHighEntropyValues([
        'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'formFactors',
        'architecture', 'bitness', 'wow64']);
    const full = ch.uaFullVersion;
    const versionsMatch = typeof full === 'string' && full.split('.')[0] === match[1] &&
        ['Chromium', 'Google Chrome'].every(brand =>
            ch.brands?.some(item => item.brand === brand && item.version === match[1]) &&
            ch.fullVersionList?.some(item => item.brand === brand && item.version === full));
    return versionsMatch && ch.platform === 'Android' && ch.mobile === true &&
        ch.model === expected.model && ch.platformVersion === expected.platform_version &&
        ch.architecture === '' && ch.bitness === '' && ch.wow64 === false &&
        ch.formFactors?.length === 1 && ch.formFactors[0] === 'Mobile';
}"""


def android_profile(seed, device=None):
    """Return a fresh copy of the complete phone preset for a uint32 seed."""
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("Android seed must be an integer from 0 to 4294967295")
    if device is None:
        device = _CATALOG["default_profile_ids"][seed % len(_CATALOG["default_profile_ids"])]
    if not isinstance(device, str) or device not in _PROFILES:
        raise ValueError("Unknown Android mobile_device; choose a catalog ID: " + ", ".join(_PROFILES))
    return dict(_PROFILES[device])


def mobile_profile(seed, device=None, platform="android"):
    if platform == "android":
        return android_profile(seed, device)
    if platform != "ios":
        raise ValueError('Mobile profiles require platform="android" or "ios"')
    if isinstance(seed, bool) or not isinstance(seed, int) or not 0 <= seed <= 0xFFFFFFFF:
        raise ValueError("iPhone seed must be an integer from 0 to 4294967295")
    device = "iphone-16" if device is None else device
    if not isinstance(device, str) or device not in _IOS_PROFILES:
        raise ValueError("Unknown iPhone mobile_device; choose a catalog ID: " + ", ".join(_IOS_PROFILES))
    return dict(_IOS_PROFILES[device])


IOS_ENGINE_PROBE = r"""expected => {
    if (!expected || navigator.platform !== 'iPhone' ||
        navigator.userAgent !== expected.user_agent ||
        'userAgentData' in navigator || 'NavigatorUAData' in globalThis ||
        navigator.maxTouchPoints < 1) return false;
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return !!ext && gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) === 'Apple Inc.' &&
        gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) === 'Apple GPU';
}"""


def engine_probe(platform="android"):
    return IOS_ENGINE_PROBE if platform == "ios" else ENGINE_PROBE


def context_options(seed, options=None, device=None, platform="android"):
    """Native Playwright mobile emulation; explicit context options take priority."""
    profile = mobile_profile(seed, device, platform)
    result = dict(options or {})
    if result.get("user_agent") is not None:
        raise ValueError(("iPhone uses its catalog UA; " if platform == "ios" else
                          "Android Chrome uses the native engine UA and matching Client Hints; ") +
                         "context user_agent overrides are not supported")
    if result.get("no_viewport") or ("viewport" in result and result["viewport"] is None):
        return result
    defaults = {
        "viewport": {"width": profile["width"], "height": profile["height"]},
        "screen": {"width": profile["width"], "height": profile["height"]},
        "device_scale_factor": profile["dpr"], "is_mobile": True, "has_touch": True,
    }
    return dict(defaults, **result)


def validate_launch(platform, binary, extra=None, stealth_args=True, mobile_device=None):
    if isinstance(platform, str) and platform.lower() in ("android", "ios") and platform != platform.lower():
        raise ValueError('Use platform="%s" for the mobile profile' % platform.lower())
    if platform not in ("android", "ios"):
        if mobile_device is not None:
            raise ValueError('mobile_device requires platform="android" or "ios"')
        return
    if mobile_device is not None:
        mobile_profile(0, mobile_device, platform)
    if not stealth_args:
        raise ValueError("Mobile profiles require stealth_args=True to enable their native identity")
    # The initial category supports current Chrome, not WebView or arbitrary UAs.
    conflicts = ("--user-agent=", "--fingerprint-brand=", "--fingerprint-brand-version=",
                 "--fingerprint-platform-version=", "--fingerprint-platform=", "--fingerprint=",
                 "--fingerprint-mobile-device=")
    if any(isinstance(arg, str) and
           (arg.startswith(conflicts) or arg in tuple(key[:-1] for key in conflicts))
           for arg in (extra or ())):
        raise ValueError("Android preview uses the catalog model/OS and current Chrome; "
                         "conflicting identity overrides are not supported")
