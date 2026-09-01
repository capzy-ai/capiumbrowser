"""
Drive the Capium stealth browser with Selenium.

Capium is a Chromium fork, so Selenium controls it through ChromeDriver exactly
like Chrome -- you only swap the binary and add the persona / license / proxy
flags. Selenium Manager (bundled with Selenium >= 4.6) auto-downloads a
ChromeDriver matching the Capium build's Chromium version.

    pip install "selenium>=4.6"

NOTE ON STEALTH: the first-party SDK (`capiumbrowser`, Playwright-based) is the
cleaner driver -- Playwright does NOT inject the ChromeDriver `cdc_...` document
properties some detectors look for. Capium's binary forces navigator.webdriver
= false either way, but if you have the choice, prefer the SDK. Use Selenium
when you already have Selenium infrastructure. See examples/README.md.
"""

import os

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service  # only if pinning a driver


# ---------------------------------------------------------------------------
# 1. The Capium launcher
# ---------------------------------------------------------------------------
# Linux/macOS: point at the `capium` WRAPPER -- it adds the GPU/WebGPU + font
#   coherence flags for you and execs the real engine.
# Windows: point at chrome.exe (the wrapper is a bash script); the persona flags
#   below are enough, but WebGL runs on the host GPU so run on a GPU machine.
CAPIUM_BINARY = os.environ.get("CAPIUM_BINARY", "/opt/capium/capium")

# ---------------------------------------------------------------------------
# 2. License  (the binary is license-gated and FAILS CLOSED -- no key, no launch)
# ---------------------------------------------------------------------------
# The binary reads its key from the ENVIRONMENT (never argv/`ps`), so just set
# CAPIUM_LICENSE_KEY in this process and Selenium's child inherits it. Keys look
# like cap_XXXXXXXXXXXXXXXXXXXXXXXX. Alternatively drop it in ~/.capium/license
# as a line:  KEY=cap_XXXXXXXXXXXXXXXXXXXXXXXX
# Optional: CAPIUM_LICENSE_SERVER=<url> overrides the default license service.
if not os.environ.get("CAPIUM_LICENSE_KEY"):
    print("warning: CAPIUM_LICENSE_KEY is not set -- the binary will fail closed.")

# ---------------------------------------------------------------------------
# 3. Persona + proxy
# ---------------------------------------------------------------------------
SEED = int(os.environ.get("CAPIUM_SEED", "54321"))   # stable, coherent identity
PLATFORM = os.environ.get("CAPIUM_PLATFORM", "windows")  # windows | macos | linux

# Inline proxy: scheme://user:pass@host:port  (http/https/socks5).
# A comma in the username (session id) is fine -- if you build the flag by hand,
# encode a literal ',' as %2C; the binary decodes it before authenticating.
PROXY = os.environ.get("CAPIUM_PROXY", "")   # e.g. http://user:pass@host:port

HEADLESS = os.environ.get("CAPIUM_HEADLESS", "0") == "1"


def build_options() -> Options:
    options = Options()
    options.binary_location = CAPIUM_BINARY

    # --- persona (mirrors capiumbrowser's default stealth recipe) ---
    options.add_argument(f"--fingerprint={SEED}")
    options.add_argument(f"--fingerprint-platform={PLATFORM}")
    options.add_argument("--fingerprint-noise=false")   # clean FingerprintJS tampering ML
    if PLATFORM == "windows":
        # Needs real Windows fonts on the host (or CAPIUM_FONTS_DIR); harmless elsewhere.
        options.add_argument("--fingerprint-windows-font-metrics")

    # --- license ---
    # No flag needed: the binary picks up CAPIUM_LICENSE_KEY from the inherited
    # environment. (Passing it on argv would leak it via `ps`.)

    # --- proxy + in-browser geo coherence ---
    # --geoip makes the BINARY resolve its own exit IP through the proxy and pin
    # timezone / WebRTC / geolocation / navigator.languages to it -- no launcher
    # probe, no CDP. With a proxy set it also happens implicitly; passing --geoip
    # additionally covers the no-proxy case (pin to the host's real public IP).
    if PROXY:
        options.add_argument(f"--proxy-server={PROXY}")
    options.add_argument("--geoip")

    if HEADLESS:
        options.add_argument("--headless=new")
        # On a GPU-less headless host WebGL falls back to SwiftShader and FPJS may
        # report virtual_machine=true / anti_detect=true. For a clean verdict run
        # headed, or on a GPU-backed host (or Xvfb + a GPU). See examples/README.md.

    # Don't let ChromeDriver advertise automation. Capium already forces
    # navigator.webdriver=false in the engine; this drops the extra switches
    # (the "controlled by automated software" infobar + enable-automation).
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)
    return options


def main() -> None:
    options = build_options()

    # Selenium Manager (Selenium >= 4.6) fetches a ChromeDriver matching the
    # Capium build's Chromium version automatically. To pin one instead:
    #     driver = webdriver.Chrome(
    #         service=Service(executable_path="/path/to/chromedriver"),
    #         options=options)
    driver = webdriver.Chrome(options=options)
    try:
        driver.get("https://ipinfo.io/json")
        print("egress   :", driver.find_element("tag name", "body").text.strip()[:200])
        print("webdriver:", driver.execute_script("return navigator.webdriver"))
        print("timezone :", driver.execute_script(
            "return Intl.DateTimeFormat().resolvedOptions().timeZone"))
        print("languages:", driver.execute_script("return navigator.languages"))
        print("platform :", driver.execute_script("return navigator.platform"))
    finally:
        driver.quit()


if __name__ == "__main__":
    main()
