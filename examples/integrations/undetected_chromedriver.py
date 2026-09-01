"""undetected-chromedriver + Capium: a double stealth layer.

undetected-chromedriver hides the ChromeDriver automation signals; Capium
patches the browser fingerprints at the C++ level. Capium already forces
navigator.webdriver=false in the engine, so this pairing is belt-and-suspenders
for people who already run undetected-chromedriver.

    pip install undetected-chromedriver capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...
"""
import os

import undetected_chromedriver as uc

from capiumbrowser import CAPIUM_BINARY_VERSION
from capiumbrowser.config import get_default_stealth_args
from capiumbrowser.download import ensure_binary

binary_path = ensure_binary()
chromium_major = int(CAPIUM_BINARY_VERSION.split(".")[0])
stealth_args = get_default_stealth_args(
    seed=int(os.environ.get("CAPIUM_SEED", "54321")),
    platform=os.environ.get("CAPIUM_PLATFORM", "windows"),
)

options = uc.ChromeOptions()
options.binary_location = binary_path
options.add_argument("--headless=new")
for arg in stealth_args:
    options.add_argument(arg)

# version_main must match the Capium build's Chromium major so uc fetches the
# right ChromeDriver.
driver = uc.Chrome(options=options, version_main=chromium_major)

driver.get("https://example.com")
print("undetected-chromedriver + Capium:", driver.title)

result = driver.execute_script("""
    return {
        webdriver: navigator.webdriver,
        plugins: navigator.plugins.length,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
    }
""")
print("Stealth checks:", result)

driver.quit()
