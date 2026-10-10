"""Verified desktop browser-brand identities for the development native engine."""
import json
from pathlib import Path

_CATALOG = json.loads(Path(__file__).with_name("browser-brands.json").read_text(encoding="utf-8"))
_PROFILES = {p["brand"]: p for p in _CATALOG["profiles"]}


def normalize_brand(brand):
    if brand is None:
        return "chrome"
    if not isinstance(brand, str) or brand.lower() not in ("chrome", *_PROFILES):
        raise ValueError("browser_brand must be chrome, edge, opera, or vivaldi")
    return brand.lower()


def brand_args(brand, platform):
    brand = normalize_brand(brand)
    if brand == "chrome":
        return []
    if platform not in ("windows", "macos", "linux"):
        raise ValueError("browser_brand requires a desktop platform")
    return ["--fingerprint-brand=" + brand]


def validate_launch(brand, platform, binary, extra, stealth_args):
    flags = brand_args(brand, platform)
    if not flags:
        return
    if not stealth_args:
        raise ValueError("browser_brand requires stealth_args=True")
    conflicts = ("--user-agent", "--fingerprint-brand", "--fingerprint-brand-version", "--fingerprint-platform")
    if any(isinstance(arg, str) and any(arg == key or arg.startswith(key + "=") for key in conflicts) for arg in (extra or [])):
        raise ValueError("browser_brand uses the verified catalog; conflicting identity overrides are not supported")


def profile(brand):
    return dict(_PROFILES[normalize_brand(brand)])


ENGINE_PROBE = """async expected => {
  const h = await navigator.userAgentData?.getHighEntropyValues(['fullVersionList','uaFullVersion']);
  if (!h) return false;
  const chromium = expected.chromium_version, product = expected.hint_brand === 'Google Chrome' ? chromium : expected.product_version;
  const expectedBrands = {Chromium: chromium, [expected.hint_brand]: product};
  const full = Object.fromEntries(h.fullVersionList.map(b => [b.brand, b.version]));
  const low = Object.fromEntries(h.brands.map(b => [b.brand, b.version]));
  const recognized = ['Google Chrome', 'Microsoft Edge', 'Opera', 'Vivaldi', 'Chromium'];
  return h.uaFullVersion === product && h.mobile === false &&
    Object.entries(expectedBrands).every(([brand, version]) => full[brand] === version && low[brand] === version.split('.')[0]) &&
    recognized.every(brand => !(brand in full) || brand in expectedBrands) &&
    navigator.userAgent.includes('Chrome/' + chromium.split('.')[0] + '.0.0.0') &&
    (!expected.ua_suffix || navigator.userAgent.endsWith(expected.ua_suffix + expected.ua_version)) &&
    (expected.brand !== 'vivaldi' || !navigator.userAgent.includes('Vivaldi/'));
}"""


def require_engine(context, brand):
    if normalize_brand(brand) == "chrome":
        return
    page = context.new_page()
    try:
        page.route("**/*", lambda route: route.fulfill(status=200, content_type="text/html", body="<!doctype html>"))
        page.goto("https://capium-desktop-preview.invalid/", wait_until="domcontentloaded")
        if not page.evaluate(ENGINE_PROBE, profile(brand)):
            raise ValueError("This binary does not support the verified desktop browser-brand mappings; use Capium 1.2.1 revision 2 or later")
    finally:
        page.close()


async def require_engine_async(context, brand):
    if normalize_brand(brand) == "chrome":
        return
    page = await context.new_page()
    try:
        await page.route("**/*", lambda route: route.fulfill(status=200, content_type="text/html", body="<!doctype html>"))
        await page.goto("https://capium-desktop-preview.invalid/", wait_until="domcontentloaded")
        if not await page.evaluate(ENGINE_PROBE, profile(brand)):
            raise ValueError("This binary does not support the verified desktop browser-brand mappings; use Capium 1.2.1 revision 2 or later")
    finally:
        await page.close()
