# Examples

Ways to drive the Capium stealth browser from your own code and from popular
automation / scraping / AI frameworks.

Capium is a **Chromium fork**, so any Chromium automation tool works: point it at
the Capium binary and add the persona / license / proxy flags. Nothing is special
about the wire protocol — it's stock Chrome DevTools. The first-party
[`capiumbrowser` SDK](../README.md) (Playwright-based) is the cleanest driver and
the recommended default.

Every example expects a license key in the environment — the binary is
license-gated and **fails closed**:

```bash
export CAPIUM_LICENSE_KEY=cap_xxxxxxxxxxxxxxxxxxxx
export CAPIUM_SEED=54321          # optional: pin a coherent identity
export CAPIUM_PLATFORM=windows    # optional: windows | macos | linux
export CAPIUM_PROXY=http://user:pass@host:port   # optional
```

---

## Core usage

| File | Shows |
|------|-------|
| [`profiles.py`](profiles.py) | Launching all three OS personas (windows/macos/linux), persistent per-account profiles, a fleet of accounts, and persona + proxy + geo together. |

---

## Integrations (`integrations/`)

Each file adapts a well-known framework to launch Capium instead of vanilla
Chromium — so your existing pipeline keeps its API and gains source-level stealth.

| File | Framework | How it connects |
|------|-----------|-----------------|
| [`selenium.py`](integrations/selenium.py) | **Selenium** (ChromeDriver) | `binary_location` = the Capium wrapper |
| [`undetected_chromedriver.py`](integrations/undetected_chromedriver.py) | **undetected-chromedriver** | Capium binary + `get_default_stealth_args()` |
| [`browser_use.py`](integrations/browser_use.py) | **browser-use** (AI agent) | CDP: `launch_async(args=["--remote-debugging-port=…"])` |
| [`crawl4ai.py`](integrations/crawl4ai.py) | **Crawl4AI** | CDP `browser_mode="cdp"` |
| [`crawlee.py`](integrations/crawlee.py) | **Crawlee** (`PlaywrightCrawler`) | custom `PlaywrightBrowserPlugin` |
| [`langchain_loader.py`](integrations/langchain_loader.py) | **LangChain** | stealth document loader → `Document` |
| [`scrapling.py`](integrations/scrapling.py) | **Scrapling** | CDP `ws://` endpoint |
| [`agent_browser.sh`](integrations/agent_browser.sh) | **agent-browser** (Node CLI) | `AGENT_BROWSER_EXECUTABLE_PATH` + args |
| [`aws_lambda/`](integrations/aws_lambda/) | **AWS Lambda** (container image) | headed under Xvfb; `launch_async` handler |

**Two patterns show up:**

- **CDP attach** (browser-use, Crawl4AI, Scrapling) — launch Capium with
  `--remote-debugging-port`, then point the framework at that port. Capium owns
  the browser + fingerprints; the framework owns the automation logic.
- **Binary swap** (Selenium, undetected-chromedriver, Crawlee, agent-browser) —
  hand the framework Capium's binary path plus
  `capiumbrowser.config.get_default_stealth_args(seed=…, platform=…)`. Capium
  handles fingerprints at the C++ level, so disable the framework's own JS-level
  header/fingerprint spoofing where it has one.

---

## Selenium — the details

```bash
pip install "selenium>=4.6"          # Selenium Manager auto-fetches ChromeDriver
export CAPIUM_BINARY=/opt/capium/capium          # the launcher
python integrations/selenium.py
```

- **The binary.** On **Linux / macOS** point `CAPIUM_BINARY` at the **`capium`
  wrapper** — it adds the GPU/WebGPU-adapter + font-coherence flags, then execs
  the engine. On **Windows** point at `chrome.exe` (the wrapper is a bash script);
  the persona flags in the example are enough.
- **The license.** The binary reads `CAPIUM_LICENSE_KEY` from its inherited
  environment (never argv/`ps`), or from `~/.capium/license` with a
  `KEY=cap_…` line. `CAPIUM_LICENSE_SERVER` overrides the default service.
- **ChromeDriver version.** Selenium Manager (≥ 4.6) matches the Capium build's
  Chromium version automatically; pin one with `Service(executable_path=…)`.
- **Proxy + geo coherence.** `--proxy-server=scheme://user:pass@host:port`
  (http/https/socks5) plus `--geoip` makes the **binary itself** resolve its exit
  IP through the proxy and pin timezone, WebRTC IP, geolocation, and
  `navigator.languages` to it — no launcher probe, no CDP.

---

## Two honest caveats

1. **Selenium / undetected-chromedriver are slightly louder than the SDK.**
   ChromeDriver injects `cdc_…` document properties some detectors fingerprint.
   Capium forces `navigator.webdriver=false` in the engine regardless, but
   Playwright (the SDK) injects none of that — so it's the cleaner path when you
   have the choice.

2. **Judge the fingerprint on a real-GPU host.** On a **headless, GPU-less** box,
   WebGL falls back to SwiftShader and FingerprintJS reports
   `virtual_machine=true` / `anti_detect=true` — an artifact of the host, not the
   browser (stock Chrome trips it there too). Run **headed**, or on a GPU-backed
   instance (or Xvfb + a GPU), for the clean verdict.

---

## The SDK equivalent (recommended)

```python
import capiumbrowser

ctx = capiumbrowser.launch_persistent_context(
    "profile-dir",
    seed=54321,                 # coherent identity
    platform="windows",         # windows | macos | linux
    proxy="http://user:pass@host:port",   # inline; commas ok
    geoip=True,                 # binary pins tz/WebRTC/geo/language to the exit
    # license_key="cap_…",      # or read from CAPIUM_LICENSE_KEY / ~/.capium/license
)
page = ctx.pages[0]
page.goto("https://ipinfo.io/json")
print(page.evaluate("() => document.body.innerText"))
ctx.close()
```

`--fingerprint-noise=false` and `--fingerprint-windows-font-metrics` (the clean
recipe) are passed **by default**; override with `stealth_args=False` or extra
`args=[...]`. See the [capiumbrowser README](../README.md) and
<https://docs.capiumbrowser.com> for the full API.
