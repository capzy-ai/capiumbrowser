<p align="center">
  <img src="assets/capzy-banner.png" alt="Capium — stealth Chromium for Playwright" width="820">
</p>

<p align="center">
  <a href="https://pypi.org/project/capiumbrowser/"><img src="https://img.shields.io/pypi/v/capiumbrowser?color=2b8a3e" alt="PyPI"></a>
  <a href="https://www.npmjs.com/package/capiumbrowser"><img src="https://img.shields.io/npm/v/capiumbrowser?color=cb3837" alt="npm"></a>
  <img src="https://img.shields.io/badge/python-3.8%2B-blue" alt="Python 3.8+">
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen" alt="Node 18+">
  <img src="https://img.shields.io/badge/drivers-Playwright%20%C2%B7%20Puppeteer-45ba4b" alt="Playwright / Puppeteer">
  <a href="https://docs.capiumbrowser.com"><img src="https://img.shields.io/badge/docs-capiumbrowser.com-6741d9" alt="Docs"></a>
  <a href="https://capiumbrowser.com"><img src="https://img.shields.io/badge/website-capiumbrowser.com-1c7ed6" alt="Website"></a>
</p>

<h3 align="center">A stealth Chromium built to withstand bot detection — because it's a real browser.</h3>

<table><tr><td>
Not a patched config. Not a JavaScript injection. A real Chromium binary whose fingerprints are rewritten at the <strong>C++ source level</strong> and compiled in. Page scripts that hunt for injected hooks find nothing to catch — the values a site reads <em>are</em> the persona's values, produced by the engine. Drive it with the <strong>Playwright</strong> or <strong>Puppeteer</strong> API you already know — from <strong>Python</strong> or <strong>Node.js</strong>.
</td></tr></table>

<p align="center">
  <sub>Say hi to <b>Capzy</b> 🕵️ — the stealth little guy who helps your automation blend in.</sub>
</p>

<p align="center">
  <a href="https://capiumbrowser.com">capiumbrowser.com</a> ·
  <a href="https://docs.capiumbrowser.com">Documentation</a> ·
  <a href="https://capiumbrowser.com/#pricing">Pricing</a> ·
  <a href="https://capiumbrowser.com/#demo">Demo</a> ·
  <a href="examples">Examples</a>
</p>

---

**One browser, two official SDKs** — same options, same builds, same license:

| SDK | Install | Folder |
|---|---|---|
| 🐍 **Python** — Playwright | `pip install capiumbrowser` | [capiumbrowser-python/](capiumbrowser-python/) |
| 🟨 **Node.js** — Playwright *or* Puppeteer | `npm install capiumbrowser playwright-core`<br>`npm install capiumbrowser puppeteer-core` | [capiumbrowser-node/](capiumbrowser-node/) |

- **Source-level C++ stealth** — User-Agent & UA-CH, WebGL/GPU, canvas, audio, screen, hardware, fonts, voices, WebRTC, `navigator.webdriver`, DevTools, pointer, client-rects — all rewritten **in the browser's own source**, below the JavaScript layer.
- **Coherent per-seed identities** — one integer **seed** derives a complete, self-consistent device (OS, GPU, cores, memory, screen, fonts, UA). Same seed ⇒ same machine, on any host, every run.
- **`humanize=True`** — ordinary `page.click` / `fill` / `type` become curved, human-timed mouse, keyboard, and scroll. One flag, and interactions look human rather than scripted.
- **`geoip=True`** — the binary resolves its own exit IP through your proxy and pins timezone, WebRTC IP, geolocation, and `navigator.languages` to match. The clock, locale, and IP all tell one story.
- **Plain drivers over CDP** — no patched driver, no init-script signature, no `Object.defineProperty` shim to detect. Update the engine independently (`pip install -U playwright` / `npm i -U playwright-core`).
- **Always the latest binary** — one license key fetches the newest checksum-verified build for your platform and reuses it thereafter.
- **Free tier — 1 concurrent session.** Paid tiers raise the concurrent-session cap. [Start free →](https://capiumbrowser.com)

```python
from capiumbrowser import launch_context

browser, ctx, page = launch_context(
    seed=200123,                 # a coherent, repeatable device
    proxy="http://user:pass@host:port", geoip=True,   # exit IP + matching tz/geo/WebRTC
    humanize=True,               # human-like clicks/typing/scrolls
    url="https://fingerprint.com/demo/")

page.fill("#email", "alex@example.com")   # humanized automatically
page.click("#submit")
browser.close()                  # also stops the Playwright driver — no leaked processes
```

```js
// Node.js — same options in camelCase; auto-detects the installed driver
// (or pick one: require('capiumbrowser/playwright') / require('capiumbrowser/puppeteer'))
const { launchContext } = require('capiumbrowser');

const { browser, page } = await launchContext({
  seed: 200123,
  proxy: 'http://user:pass@host:port', geoip: true,
  humanize: true,                // attaches page.humanClick / humanType / humanScroll
  url: 'https://fingerprint.com/demo/',
});
await page.humanType('#email', 'alex@example.com');
await browser.close();
```

> The `capiumbrowser` **SDKs are open**; the **Capium browser binary is licensed** per concurrent session. There's a **free tier with 1 concurrent session** — see [Licensing](#licensing).

---

## Table of contents

- [Install](#install) · [Why Capium](#why-capium) · [Licensing & tiers](#licensing)
- [What a persona reads](#what-a-persona-reads) · [Comparison](#comparison) · [How it works](#how-it-works)
- [API](#api) · [Parameters](#parameters) · [Personas & seeds](#personas--seeds) · [Fingerprint switches](#fingerprint-switches)
- [Human behavior](#human-behavior) · [Proxies & geo](#proxies--geo) · [Fonts](#fonts)
- [Framework integrations](#framework-integrations) · [Deployment](#deployment) · [Platforms](#platforms)
- [CLI](#cli--environment) · [Troubleshooting](#troubleshooting) · [FAQ](#faq) · [Security](#security) · [License](#license)

---

## Install

```bash
pip install capiumbrowser              # the SDK
pip install -U playwright              # the driver — a normal, independently-updatable dependency
python -m playwright install-deps      # OS libraries for Chromium (once, on Linux)
```

```bash
# Node.js — pick your driver (both are optional peer dependencies):
npm install capiumbrowser playwright-core     # Playwright
npm install capiumbrowser puppeteer-core      # Puppeteer
```

You do **not** run `playwright install chromium` — Capium ships its own binary. On first launch the SDK
fetches the per-platform build from the license service (authenticated, checksum-verified) and caches it.

### Download the browser — just your license key

The browser binary is fetched with **only your Capium license key** — no separate token, no manual
download, no per-platform URL to figure out. Set the key once:

```bash
export CAPIUM_LICENSE_KEY=cap_your_key_here
# or put a `KEY=cap_...` line in ~/.capium/license
```

Then the right build for your OS/arch downloads automatically — either **on first launch**, or ahead of
time with the CLI:

```bash
python -m capiumbrowser install      # Python
npx capiumbrowser install            # Node.js
# ...or skip this entirely: the first launch() downloads it for you.
```

That same key both **authorizes the download** and **licenses the browser**, and it's passed to the binary
through the environment — never on the command line. The download is checksum-verified before anything
runs, and the build is cached (under `~/.capium`), so it's fetched once and reused. Check what you have and
what you still need with `python -m capiumbrowser` / `npx capiumbrowser` (the `info` command).

---

## Downloading builds directly

Most people just let the SDK download the browser (above). But for **Docker builds, air-gapped installs, CI
caching, or your own tooling**, you can pull a specific build's `.tar.gz` straight from the license service.

### The request

```
GET https://license.capzy.ai/download/distro/chromium-v<version>/capiumbrowser-<tag>.tar.gz
```

Authenticated with your license key plus a short HMAC signature over the request path — three headers:

| Header | Value |
| --- | --- |
| `X-Capzy-License` | your `cap_...` key |
| `X-Capzy-Timestamp` | current time, Unix seconds |
| `X-Capzy-Signature` | `HMAC-SHA256(key, "<timestamp>.<path>")`, lowercase hex |

Send a non-default `User-Agent` too. The response streams the archive and includes an `X-Capzy-SHA256`
header you can verify against the bytes.

### Platform tags & current versions

| `<tag>` | `<version>` |
| --- | --- |
| `windows-x64` | `152.0.7977.65` |
| `macos-arm64` | `152.0.7977.65` |
| `linux-x64` | `152.0.7977.64` |
| `linux-arm64` | *(coming soon)* |

The current stable version per platform is also in each [release's checksums](https://github.com/capzy-ai/capiumbrowser/releases).

### curl (bash)

```bash
KEY="cap_your_key_here"
VERSION="152.0.7977.65"          # see the table above
TAG="windows-x64"                # windows-x64 | macos-arm64 | linux-x64 | linux-arm64
REQ_PATH="/download/distro/chromium-v${VERSION}/capiumbrowser-${TAG}.tar.gz"

TS=$(date +%s)
SIG=$(printf '%s' "${TS}.${REQ_PATH}" | openssl dgst -sha256 -hmac "${KEY}" | sed 's/^.*= //')

curl -fSL "https://license.capzy.ai${REQ_PATH}" \
  -H "X-Capzy-License: ${KEY}" \
  -H "X-Capzy-Timestamp: ${TS}" \
  -H "X-Capzy-Signature: ${SIG}" \
  -H "User-Agent: capiumbrowser/1.0.0" \
  -o "capiumbrowser-${TAG}.tar.gz"

# verify (optional): compare against the X-Capzy-SHA256 header / the release checksums
sha256sum "capiumbrowser-${TAG}.tar.gz"
```

### Node.js

```js
const crypto = require('crypto');
const fs = require('fs');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');

const KEY = process.env.CAPIUM_LICENSE_KEY;
const VERSION = '152.0.7977.65', TAG = 'windows-x64';
const path = `/download/distro/chromium-v${VERSION}/capiumbrowser-${TAG}.tar.gz`;

const ts = String(Math.floor(Date.now() / 1000));
const sig = crypto.createHmac('sha256', KEY).update(`${ts}.${path}`).digest('hex');

const res = await fetch(`https://license.capzy.ai${path}`, {
  headers: {
    'X-Capzy-License': KEY,
    'X-Capzy-Timestamp': ts,
    'X-Capzy-Signature': sig,
    'User-Agent': 'capiumbrowser/1.0.0',
  },
});
await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(`capiumbrowser-${TAG}.tar.gz`));
```

### Python

```python
import hashlib, hmac, time, urllib.request

KEY = "cap_your_key_here"
VERSION, TAG = "152.0.7977.65", "windows-x64"
path = f"/download/distro/chromium-v{VERSION}/capiumbrowser-{TAG}.tar.gz"

ts = str(int(time.time()))
sig = hmac.new(KEY.encode(), f"{ts}.{path}".encode(), hashlib.sha256).hexdigest()
req = urllib.request.Request("https://license.capzy.ai" + path, headers={
    "X-Capzy-License": KEY, "X-Capzy-Timestamp": ts, "X-Capzy-Signature": sig,
    "User-Agent": "capiumbrowser/1.0.0",
})
with urllib.request.urlopen(req) as r, open(f"capiumbrowser-{TAG}.tar.gz", "wb") as f:
    f.write(r.read())
```

If the SDK is already installed, it does the signing for you — `capiumbrowser.licensing.client.get_headers(key, path)`
returns the three headers, and `download.distro_path(version, tag)` builds the path.

### Using a build you downloaded

Extract it, then point the SDK at it — no re-download:

```bash
mkdir -p ~/.capium && tar -xzf capiumbrowser-windows-x64.tar.gz -C ~/.capium/capium-152-windows-x64
export CAPIUM_BINARY=~/.capium/capium-152-windows-x64/chrome     # chrome.exe on Windows
```

Or drop the extracted `capium-*` folder under `CAPIUM_HOME` and the SDK discovers it automatically.

**Migrating from Playwright?** It's a one-line change — the returned object is a standard Playwright `Browser`:

```diff
- from playwright.sync_api import sync_playwright
- pw = sync_playwright().start()
- browser = pw.chromium.launch()
+ from capiumbrowser import launch
+ browser = launch(seed=200123)

  page = browser.new_page()
  page.goto("https://example.com")     # the rest of your code is unchanged
```

> ⭐ **Star** the repo to follow along — Capium tracks Chrome closely and ships new builds as detection evolves.

---

## Why Capium

- **Config-level stealth breaks.** `playwright-stealth`, `undetected-chromedriver`, and friends inject
  JavaScript or flip flags. Every Chrome update breaks them, and modern anti-bot ML detects the patches
  themselves — the very act of hiding trips the alarm.
- **Capium patches Chromium source.** Fingerprints are modified at the C++ level and compiled into the
  binary. Detection sites see a real browser because it *is* one — no init script, no `toString`
  tampering, no CDP hooks to sniff.
- **Coherence is the product.** A convincing device isn't one clean signal; it's *every* signal telling
  the same story. Capium derives GPU, screen, fonts, UA-CH, timezone, locale, and WebRTC from a single
  seed + your proxy's geography, so nothing contradicts anything else.
- **Same behavior everywhere.** Local, Docker, VPS, Lambda — no environment-specific config.
- **Works with your stack.** Drop-in stealth for Selenium, undetected-chromedriver, browser-use, Crawl4AI,
  Crawlee, Scrapling, LangChain, and more. See [integrations](#framework-integrations).

Capium doesn't solve CAPTCHAs, and no stealth tool can promise you'll never see one. What a coherent,
real-browser fingerprint does is remove the automation tells that commonly *trigger* challenges — it
reduces friction, it doesn't guarantee a challenge-free session. No CAPTCHA-solving services, no built-in
proxy rotation: bring your own proxies and use the Playwright API you already know.

> **Responsible use.** Capium is a stealth browser for legitimate automation, testing, QA, and research.
> It makes **no guarantee** of evading any particular bot-detection or anti-fraud system, and results vary
> by site, proxy, and configuration. You are responsible for complying with the terms of service of the
> sites you access and with all applicable laws.

---

## Licensing

The **browser binary is licensed per concurrent session** — each running browser holds one seat, freed the
moment it closes. Installing or activating on many machines is free; only *live* sessions count, across all
your machines. The `capiumbrowser` SDK never holds a seat itself.

| Tier | Concurrent sessions | For |
|---|---|---|
| **Free** | 1 | Trying it, one browser at a time |
| **Solo** | 5 | Solo projects |
| **Team** | 20 | Small teams |
| **Business** | 200 | Production scraping / QA / monitoring |
| **Scale** | 2,000+ | High-volume automation |

See **[capiumbrowser.com/#pricing](https://capiumbrowser.com/#pricing)** for current pricing and to create a key.

### Get a key

1. Create an account at **[capiumbrowser.com](https://capiumbrowser.com)** and create a license (start with the
   free 1-session tier). Keys look like `cap_XXXXXXXXXXXXXXXXXXXXXXXX`.
2. Make it available to the SDK any one way (checked in this order):

   ```bash
   export CAPIUM_LICENSE_KEY="cap_xxxxxxxxxxxxxxxxxxxx"
   # optional — defaults to https://license.capzy.ai
   export CAPIUM_LICENSE_SERVER="https://license.capzy.ai"
   ```

   …or a file at `~/.capium/license` (chmod 600) with a `KEY=cap_…` line, or pass `launch(..., license_key="cap_…")`.

The **same key gates the binary download**. The key is passed to the browser **via the environment**,
never on the command line (so it can't leak through `ps`). Check entitlements without spending a session:

```bash
python -m capiumbrowser status
# {"plan": "free", "sessions_cap": 1, "live_sessions": 0, "period_end": "...", ...}
```

Handle license errors with typed exceptions — `CapiumSeatLimitError`, `CapiumExpiredError`,
`CapiumServerDownError`, `CapiumConfigError` (all subclass `CapiumLicenseError` → `CapiumError`). Full model:
[docs.capiumbrowser.com](https://docs.capiumbrowser.com).

---

## What a persona reads

On a **matching-OS host** (a Windows persona on Windows, a macOS persona on macOS), a Capium persona reads
clean against a modern fingerprinting suite — with the correct GPU, fonts, and voices for the claimed device:

| Signal | Stock Playwright Chromium | Capium |
|---|---|---|
| `navigator.webdriver` | `true` | **`false`** (source-level) |
| FingerprintJS **bot detection** | detected | **not detected** |
| FingerprintJS **tampering / anti-detect** | — | **false** |
| DevTools/CDP console tell (FPJS `developer_tools`) | detected | **false** |
| User-Agent | `HeadlessChrome/…` | **`Chrome/152.0.0.0`** |
| `window.chrome` | thin / missing | **present, like real Chrome** |
| Google TTS voices | absent | **present (matches real Chrome)** |
| JA4 TLS fingerprint | differs from Chrome | **matches stock Chrome** |
| WebRTC IP behind a proxy | real IP leaks | **pinned to the proxy exit** |

> **Honesty matters more than a green screenshot.** A **GPU-less headless Linux** box makes WebGL fall back
> to SwiftShader, which any modern suite (and stock Chrome) flags as `virtual_machine` / `anti_detect` — an
> artifact of the *host*, not the browser. Run **headed** (Xvfb is fine) on a GPU-backed, matching-OS host
> for the clean verdict. And `os_mismatch` is a **network** signal — genuine Chrome trips it behind some
> proxies/NATs too, so treat it as a routing concern, not a browser one. Full method:
> [Verifying stealth](https://docs.capiumbrowser.com).

---

## Comparison

| | Playwright | playwright-stealth | undetected-chromedriver | **Capium** |
|---|---|---|---|---|
| Patch level | none | JS injection | config / flags | **C++ (Chromium source)** |
| Survives Chrome updates | n/a | breaks often | breaks often | **yes (rebased builds)** |
| `navigator.webdriver` | `true` | `false` | `false` | **`false`** |
| Coherent per-seed device | no | no | no | **yes** |
| Timezone/locale/WebRTC ↔ proxy | manual | manual | manual | **auto (`geoip=True`)** |
| Human input | no | no | no | **`humanize=True`** |
| Playwright API | native | native | no (Selenium) | **native** |

---

## How it works

1. **You install** → `pip install capiumbrowser` (or `npm install capiumbrowser playwright-core`). This downloads **nothing** but the SDK — the
   ~230 MB binary needs your license key, so it can't be fetched at pip-install time.
2. **First launch** → the license-gated binary auto-downloads for your platform (checksum-verified) and
   caches. It's fetched **lazily** on that first `launch()` — or eagerly with `python -m capiumbrowser install`.
3. **Every later launch** → the cached binary is reused instantly; plain Playwright starts it with your seed.
4. **Upgrade** → when a newer SDK bumps the target build (`CAPIUM_BINARY_VERSION`), the next launch notices the
   cached binary is a different version, **removes it, and downloads the new one** — no manual reinstall.

The spoofing lives in the compiled binary — not injected via JavaScript, not set via a detectable CDP
`Emulation` call. Identity comes from one seed; proxy, geolocation, timezone, WebRTC, and locale are all
aligned to a single coherent story.

**Download mechanics.** The binary is fetched from the license service with a signed, path-based GET
(`/download/distro/chromium-v<version>/capiumbrowser-<os>-<arch>.tar.gz`): the key travels in the
`X-Capzy-License` header (never the URL) and the request path is HMAC-signed. The response's
`X-Capzy-SHA256` is verified against the streamed bytes before extraction, so a corrupted or tampered
archive is rejected. The **filename is version-independent** — only the `chromium-v<version>/` folder
changes. Env overrides: `CAPIUM_LICENSE_KEY` (or `~/.capium/license`), `CAPIUM_VERSION` (target a specific
build), `CAPIUM_BINARY` (use an exact local binary, skip download), `CAPIUM_DOWNLOAD_URL` (unsigned direct
URL escape hatch), `CAPIUM_HOME` (where builds cache). A missing platform, an unpublished version (404), a
rejected license (401/403), an unreachable server, or a checksum mismatch each raise a distinct, typed
`Capium*` error.

---

## API

Every entry point has an `await`-able twin (`launch_async`, `launch_context_async`,
`launch_persistent_context_async`). The **Node SDK** mirrors the same trio — `launch`,
`launchContext`, `launchPersistentContext` (all async) — on `capiumbrowser/playwright` and
`capiumbrowser/puppeteer`, plus `buildLaunchOptions()` for frameworks that must call the
driver''s own `launch()` themselves.

| Function | Returns | Use for |
|---|---|---|
| `launch(...)` | `Browser` | full control; create your own contexts/pages |
| `launch_context(url=None, humanize=False, ...)` | `(browser, context, page)` | one-liner: open a page, optionally navigate + humanize |
| `launch_persistent_context(user_data_dir, ...)` | `BrowserContext` | **persistent** cookies/localStorage/login across runs |

```python
from capiumbrowser import launch, launch_async, launch_persistent_context

# Full control
browser = launch(seed=200123, platform="windows", headless=False)

# Proxy + coherent geo (HTTP/HTTPS/SOCKS5, inline creds)
browser = launch(seed=200123, proxy="socks5://user:pass@host:port", geoip=True)

# Explicit timezone/locale always win over geoip auto-detection
browser = launch(seed=200123, proxy="http://host:port", geoip=True, timezone="Europe/London")

# Persistent profile — stays logged in, avoids the "always fresh incognito" tell; extensions need this
ctx = launch_persistent_context("~/profiles/acct1", seed=200123, platform="linux",
                                extension_paths=["/path/to/unpacked-extension"])

# Bring your own flags — disable the defaults and build the command line yourself
browser = launch(stealth_args=False, args=["--fingerprint=200123", "--fingerprint-platform=linux"])
```

```python
import asyncio
from capiumbrowser import launch_async

async def main():
    browser = await launch_async(seed=200123, proxy="http://host:port", geoip=True)
    page = await browser.new_page()
    await page.goto("https://example.com")
    print(await page.evaluate("() => navigator.userAgent"))
    await browser.close()

asyncio.run(main())
```

```js
// Node.js — same trio, camelCase options, everything async
const { launch, launchContext, launchPersistentContext } = require('capiumbrowser');
// explicit driver: require('capiumbrowser/playwright') or require('capiumbrowser/puppeteer')

const browser = await launch({ seed: 200123, proxy: 'socks5://user:pass@host:port', geoip: true });
const ctx = await launchPersistentContext('profiles/acct1', { seed: 200123, platform: 'linux',
  extensionPaths: ['/path/to/unpacked-extension'] });
const { page } = await launchContext({ seed: 200123, humanize: true, url: 'https://example.com' });
```

---

## Parameters

Every parameter the SDK accepts. Unless noted, all of these work on **`launch`**,
**`launch_context`**, and **`launch_persistent_context`** (and their `_async` twins) — `launch_context`
and `launch_persistent_context` forward everything to `launch`. The **Node SDK** accepts the same options in camelCase (`stealthArgs`, `licenseKey`, `extensionPaths`, `humanPreset`, …).

### Identity & rendering

| Parameter | Type | Default | Description |
|---|---|---|---|
| `seed` | `int` \| `None` \| `"off"` | `None` | Persona seed → a complete coherent device. `None` = fresh random seed each launch. The range selects the OS family (see [Personas & seeds](#personas--seeds)). `"off"`/`"false"`/`"none"` = **passthrough** (host's real values; debugging). |
| `platform` | `str` | `"windows"` | Spoofed OS: `"windows"` \| `"macos"` \| `"linux"`. Sets `--fingerprint-platform` and picks the seed range if you didn't. |
| `headless` | `bool` | `False` | Headed is recommended (reads cleaner). On a server, run headed under Xvfb. |
| `stealth_args` | `bool` | `True` | Apply the default coherent fingerprint flags. Set `False` to build the whole command line yourself via `args`. |
| `args` | `list[str]` \| `None` | `None` | Extra raw Chrome flags appended verbatim (see [Fingerprint switches](#fingerprint-switches)). |

### Proxy, geo & locale

| Parameter | Type | Default | Description |
|---|---|---|---|
| `proxy` | `str` \| `dict` \| `"env"`/`True` \| `None` | `None` | HTTP/HTTPS/SOCKS5 URL with inline creds, a `{"server","username","password"}` dict, `"env"`/`True` (reads `CAPIUM_PROXY`), or `None`/`"none"`/`""`. |
| `geoip` | `bool` \| `None` | `None` | Geo coherence, resolved inside the binary. **`None` (default) — OFF**: no lookup runs, even with a proxy (a proxy alone doesn't trigger it, so proxied launches aren't slowed). **`True`** — ON: pins timezone/geo/WebRTC/`navigator.languages` to the egress (proxy exit, or the host IP if proxyless). **`False`** — explicit opt-out. No SDK-side probe. |
| `timezone` | `str` \| `None` | `None` | IANA tz (e.g. `"America/New_York"`) → `--timezone`. **Overrides** `geoip`. |
| `locale` | `str` \| `None` | `None` | BCP-47 (e.g. `"en-US"`) → `--lang` + `--accept-lang`. **Overrides** `geoip`. |

### Profiles & extensions

| Parameter | Type | Default | Description |
|---|---|---|---|
| `user_data_dir` | `str` | — | **`launch_persistent_context` only** (first positional arg). Directory where cookies/localStorage/cache persist across runs. |
| `extension_paths` | `list[str]` \| `str` \| `None` | `None` | Unpacked Chrome extension directory(ies). Extensions require a **persistent context**. |

### License

| Parameter | Type | Default | Description |
|---|---|---|---|
| `license_key` | `str` \| `None` | `None` | `cap_…` key. Falls back to `CAPIUM_LICENSE_KEY` env / `~/.capium/license`. Passed to the binary via the environment, never argv. |
| `license_server` | `str` \| `None` | `None` | Override the license server (default `https://license.capzy.ai`). |
| `license_through_proxy` | `bool` | `False` | Route license/session calls through `--proxy-server` instead of direct. |
| `license_preflight` | `bool` | `True` | Fail fast with a typed `CapiumConfigError` when no key is configured, before spinning up a browser. Set `False` for a dev build that runs without enforcement. |

### `launch_context` only

| Parameter | Type | Default | Description |
|---|---|---|---|
| `url` | `str` \| `None` | `None` | If set, navigate the returned page to it (`domcontentloaded`, 60 s) as a driven navigation. |
| `humanize` | `bool` | `False` | Wire `page.click`/`fill`/`type`/`hover` to human-like input and attach `page.human_*` helpers. **Sync API only** (no-op on async). |
| `human_preset` | `str` | `"default"` | Pace of humanized input: `"default"` (natural) or `"careful"` (slower, more deliberate). |

### Binary & Playwright passthrough

| Parameter | Type | Default | Description |
|---|---|---|---|
| `binary` | `str` \| `None` | `None` | Exact path to the `capium` wrapper — skips discovery/download (same as `CAPIUM_BINARY`). |
| `**kwargs` | — | — | Forwarded to Playwright's `chromium.launch` (e.g. `slow_mo`, `timeout`, `env`). For `launch_persistent_context`, forwarded to `launch_persistent_context` — so `viewport`, `no_viewport`, `user_agent`, `color_scheme`, `permissions`, `extra_http_headers`, etc. work too (persistent defaults to `no_viewport=True` unless you pass a `viewport`). |

> Prefer the friendly parameters (`proxy=`, `geoip=`, `timezone=`, `locale=`) over raw `args=` — reach for
> `args` only when a convenience parameter doesn't cover the surface. Environment variables that affect
> every launch are in [CLI & environment](#cli--environment).

---

## Personas & seeds

A **persona** is a complete, self-consistent device deterministically derived from one integer **seed**.
The seed range selects the OS family (or pass `platform=` and Capium picks the range for you):

| OS family | Seed range | `platform=` |
|---|---|---|
| Windows | `10000–99999` | `"windows"` |
| macOS (Apple Silicon) | `100000–199999` | `"macos"` |
| Linux | `200000–299999` | `"linux"` |

```python
launch(seed=200123)     # a specific, repeatable device
launch(seed=None)       # random seed each launch (still fully coherent)
launch(seed="off")      # PASSTHROUGH — the host's real values (debugging only)
```

> **Tip — pin a seed per account.** A fresh random seed every visit looks like a new device each time,
> which is suspicious when you keep hitting the same site from the same IP. A fixed seed reads as a
> returning visitor. **And match the persona to the host OS** — a macOS persona is flawless on a Mac and a
> Windows persona on Windows, because the host's real text-rasterizer and GPU back the claim.

### Launch every persona — and persist per account

```python
from capiumbrowser import launch_context, launch_persistent_context

# One coherent device per OS: pick platform + any stable seed
for platform, seed in (("windows", 200111), ("macos", 200222), ("linux", 200333)):
    browser, ctx, page = launch_context(seed=seed, platform=platform, url="https://browserscan.net/")
    browser.close()                       # non-persistent: close the browser

# Persist a logged-in account across runs — give it a profile DIRECTORY (persistent-only;
# launch()/launch_context() are always throwaway). Returns a context; close the context.
ctx = launch_persistent_context("~/capium-profiles/acct-a", seed=210001, platform="windows")
page = ctx.pages[0] if ctx.pages else ctx.new_page()
page.goto("https://example.com")          # cookies/localStorage persist in the profile dir
ctx.close()

# A fleet: each account its own coherent device AND its own profile
for name, seed in {"acct-a": 210001, "acct-b": 210002, "acct-c": 210003}.items():
    ctx = launch_persistent_context(f"~/capium-profiles/{name}", seed=seed, platform="macos")
    ctx.close()
```

Full runnable version (personas, persistent profiles, a fleet, proxy+geo, full control):
[`examples/profiles.py`](examples/profiles.py) · Node version: [`examples/profiles.js`](examples/profiles.js).

---

## Fingerprint switches

The SDK sets the essentials from `seed`/`platform`. Everything below is available for precise control —
pass any through `args=[...]` (or `stealth_args=False` to build the whole command line yourself):

```python
launch(seed=200123, args=[
    "--fingerprint-hardware-concurrency=8",
    "--fingerprint-screen-width=2560", "--fingerprint-screen-height=1440",
])
```

**Identity**

| Switch | What it controls |
|---|---|
| `--fingerprint=<seed>` | Master seed → the whole coherent device. `off`/`false`/`none` = **passthrough**. |
| `--fingerprint-platform=<windows\|macos\|linux>` | Spoofed OS: `navigator.platform`, UA, UA-CH platform. |
| `--fingerprint-platform-version=<v>` | UA-CH `platformVersion`. |
| `--fingerprint-brand=<name>` / `--fingerprint-brand-version=<v>` | UA-CH brand and version entries. |
| `--fingerprint-hardware-concurrency=<n>` | `navigator.hardwareConcurrency` (CPU cores). |
| `--fingerprint-screen-width=<n>` / `--fingerprint-screen-height=<n>` | `screen.width` / `screen.height`. |
| `--fingerprint-device-scale-factor=<f>` | `devicePixelRatio`. |
| `--fingerprint-storage-quota=<GB>` | `navigator.storage.estimate().quota` in **gigabytes** (also affects incognito-from-quota checks). Auto-set per-seed by the SDK (128–576 GB) so the real host/container disk never leaks — including on Windows, where no wrapper runs. |

**Rendering & noise**

| Switch | What it controls |
|---|---|
| `--fingerprint-noise=<true\|false>` | Deterministic per-seed noise on canvas image data, `measureText`, and audio. Default **off** (per-seed noise can read as tampering when the DevTools tell is patched). |
| `--disable-spoofing=<canvas,font,…>` | Selectively turn off spoofing for named surfaces (comma-separated). |

**Fonts & voices**

| Switch | What it controls |
|---|---|
| `--fingerprint-windows-font-metrics` | Measure default text with Windows metrics (**requires real Windows fonts** — see [Fonts](#fonts)). Default on for a Windows persona. |
| `--fingerprint-sapi-voices=<true\|false>` | Present the Windows SAPI voice list for a Windows persona. |

**Location, network & content**

| Switch | What it controls |
|---|---|
| `--timezone=<IANA>` | In-browser timezone (e.g. `America/New_York`). |
| `--fingerprint-location=<lat,lon>` | Geolocation API coordinates (permission auto-granted). |
| `--fingerprint-webrtc-ip=<ip\|auto>` | The IP WebRTC reports (pin to your proxy exit — the SDK does this with `geoip`). |
| `--fingerprint-allow-3p-cookies` | Allow third-party cookies (some SSO / embedded-payment flows need them). |
| `--disable-ads` | Built-in ad/tracker blocker with a login/captcha-safe allowlist (default on). |

Most of these have friendly SDK equivalents (`timezone=`, `locale=`, `proxy=`, `geoip=`). The full
per-switch matrix lives in the [docs](https://docs.capiumbrowser.com).

---

## Human behavior

Behavioral anti-bot systems score *how* you move, not just what you send. Set **`humanize=True`** on any
**synchronous** launch and your ordinary Playwright calls are driven the human way automatically:

```python
browser, ctx, page = launch_context(seed=200123, humanize=True, url="https://example.com")
page.click("#login")          # curved, overshoot-and-settle cursor, then a human press
page.fill("#user", "alice")   # focus, clear, per-key typing with realistic timing & the odd slip
page.hover(".menu")           # natural move onto the element
```

- Cursor follows a **Catmull-Rom spline** through bowed way-points, briefly **overshoots** and settles,
  timed by a **bell-shaped (min-jerk) velocity**.
- Keystrokes come from a **log-normal** inter-key distribution with longer gaps at word boundaries, plus
  occasional **adjacent-key slips** noticed and corrected with Backspace.
- Scrolling is an **inertial flick** that decays toward the target.

Two presets tune the pace: `"default"` (natural) and `"careful"` (slower). It's pure Playwright input
(`page.mouse` / `page.keyboard`) — no CDP tricks. Original methods stay reachable as `page.raw_click`, etc.,
and helpers are importable: `from capiumbrowser.human import humanize, click, type_text, scroll`.

> Humanized input is a **synchronous** engine, so `humanize=True` applies to the sync API. On async pages
> it's a safe no-op — drive async input yourself.

---

## Proxies & geo

**No proxy provider and no credentials ship with the package** — you supply your own.

```python
launch(seed=200123, proxy="http://user:pass@host:port", geoip=True)
launch(seed=200123, proxy="socks5://user:pass@host:port")   # RFC 1929 auth
```

`proxy=` accepts an HTTP/HTTPS or SOCKS5 URL (inline credentials), a `{"server","username","password"}`
dict, `"env"`/`True` (reads `CAPIUM_PROXY`), or `None`. Credentials are passed **inline** to the Capium
binary — which authenticates natively (SOCKS5 RFC 1929; preemptive HTTP `Proxy-Authorization`) — and are
URL-encoded so special characters can't truncate the proxy string into a real-IP-leaking `DIRECT` fallback.

Geo coherence is resolved **inside the binary** at launch (`PreBrowserStart`), which geolocates the egress IP
and pins timezone, geolocation, WebRTC IP, and `navigator.languages` — so the WebRTC IP equals the
site-visible IP and the clock/locale match the egress geography. There's no SDK-side network call. `geoip` is
tri-state:

- **`geoip=None` (default) — OFF.** No geo lookup runs, **even with a proxy** — a proxy alone does not
  trigger it (the lookup is a blocking egress round-trip we don't pay unless you ask). Timezone/geo stay
  at the persona/host defaults. Pass `geoip=True` to opt into proxy-exit coherence.
- **`geoip=True` — ON.** Geolocates the egress and pins timezone/geolocation/WebRTC/`navigator.languages` to
  it — the **proxy exit** when `--proxy-server` is set, else the **host's own public IP**.
- **`geoip=False` — explicit opt-out.** Same effect as `None` for a lookup, but forwards `--geoip=false` so
  the in-binary resolver is unambiguously off.

Explicit `timezone=` / `locale=` always win (they're set at launch, so they also cover the HTTP
`Accept-Language` header).

---

## Fonts

Font detection is **measurement-based** — a font only counts as "present" if it genuinely renders with the
right metrics. Capium controls what actually resolves, gating each persona to a coherent per-seed set and
hiding the host's other fonts.

- **Bundled & free (ship anywhere):** DejaVu, Liberation, and the metric-identical MS clones **Carlito**
  (= Calibri) and **Caladea** (= Cambria).
- **Proprietary (you supply from a licensed source):** genuine Apple fonts for a macOS persona on a non-Mac
  host, and genuine Microsoft fonts for a Windows persona on a non-Windows host.

On a **matching-OS host** the persona uses the operating system's own fonts and there's nothing to install.

### Copying Windows fonts to a Linux host (Windows persona on Linux)

Copy the whole font folder from any real Windows machine you own — it covers the required set
(Segoe UI, Segoe UI Light, Calibri, Marlett, MS UI Gothic, Franklin Gothic, Consolas, Courier New)
and more:

```bash
# from the Windows machine (PowerShell), push to the Linux box:
scp C:\Windows\Fonts\* user@linuxbox:~/.local/share/fonts/windows/

# on the Linux box:
mkdir -p ~/.local/share/fonts/windows      # (before the copy)
fc-cache -f                                # refresh fontconfig
```

The distro also ships **`capium-install-fonts.sh`**, which installs the free baseline
(emoji/CJK + the Carlito/Caladea/Liberation substitutes) via apt and then checks for the
required Windows set. Once the fonts resolve, the `capium` wrapper **auto-enables**
`--fingerprint-windows-font-metrics` — no flag needed. Use `CAPIUM_FONTS_DIR=/path` for a
custom directory, and `CAPIUM_SUPPRESS_FONT_WARNING=1` to silence the hint once you've
supplied them.

### Copying Windows fonts to a macOS host (Windows persona on a Mac)

Copy the same `C:\Windows\Fonts\*.ttf`/`*.ttc` files over and install them — either
double-click → Font Book, or drop them into `~/Library/Fonts/` (no cache refresh needed;
macOS picks them up immediately). Calibri/Cambria are the highest-value ones for text metrics.

### macOS persona on a non-Mac host

Needs genuine Apple fonts (SF Pro, Helvetica Neue, …) copied from a Mac you own into the same
font locations (`CAPIUM_FONTS_DIR` / `~/.local/share/fonts` on Linux). This is the hardest
cross-OS direction — a macOS persona reads cleanest on a real Mac, where the OS fonts and the
Apple GPU back the claim natively.

> **Font licensing.** Microsoft and Apple fonts are proprietary — copy them only between
> machines you hold licenses for (e.g. your own Windows/Mac machines or licensed server
> images). The bundled substitutes are free and cover the metric-critical cases as a partial
> fallback. Full per-OS guide: [docs](https://docs.capiumbrowser.com).

---

## Framework integrations

Capium is a Chromium fork, so any Chromium automation tool works — point it at the binary and add the
persona flags. Runnable examples live in [`examples/integrations/`](examples/integrations/):

| Framework | Language | Example |
|---|---|---|
| [Selenium](https://github.com/SeleniumHQ/selenium) | Python | [`selenium.py`](examples/integrations/selenium.py) |
| [undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver) | Python | [`undetected_chromedriver.py`](examples/integrations/undetected_chromedriver.py) |
| [browser-use](https://github.com/browser-use/browser-use) | Python | [`browser_use.py`](examples/integrations/browser_use.py) |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Python | [`crawl4ai.py`](examples/integrations/crawl4ai.py) |
| [Crawlee](https://github.com/apify/crawlee-python) | Python | [`crawlee.py`](examples/integrations/crawlee.py) |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | Python | [`scrapling.py`](examples/integrations/scrapling.py) |
| [LangChain](https://github.com/langchain-ai/langchain) | Python | [`langchain_loader.py`](examples/integrations/langchain_loader.py) |
| [agent-browser](https://github.com/nichochar/agent-browser) | Shell | [`agent_browser.sh`](examples/integrations/agent_browser.sh) |
| [Crawlee](https://github.com/apify/crawlee) | Node.js | [`crawlee.js`](examples/integrations/crawlee.js) |
| [@playwright/test](https://playwright.dev/docs/intro) | Node.js | [`playwright_test.spec.js`](examples/integrations/playwright_test.spec.js) |
| [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) | Node.js | [`puppeteer_cluster.js`](examples/integrations/puppeteer_cluster.js) |
| any CDP tool | Node.js | [`cdp_connect.js`](examples/integrations/cdp_connect.js) |

Two patterns cover them all:

```python
# 1) Framework launches our binary directly (Selenium, undetected-chromedriver, Crawlee)
from capiumbrowser.download import ensure_binary
from capiumbrowser.config import get_default_stealth_args
binary_path = ensure_binary()                               # auto-downloads if needed
stealth_args = get_default_stealth_args(seed=200123, platform="windows")

# 2) Capium launches first, framework connects over CDP (browser-use, Crawl4AI, Scrapling)
from capiumbrowser import launch_async
browser = await launch_async(seed=200123, geoip=True,
                             args=["--remote-debugging-port=9242"])
# point your framework at http://127.0.0.1:9242 — all stealth flags are already set
```

```js
// Node.js — the same two patterns:
// 1) buildLaunchOptions() returns {executablePath, args, env, ...} for ANY framework's
//    own launcher (Crawlee launchOptions, puppeteer-cluster puppeteerOptions, ...)
const { buildLaunchOptions } = require('capiumbrowser/playwright'); // or /puppeteer
const launchOptions = await buildLaunchOptions({ seed: 200123, platform: 'windows' });

// 2) CDP attach — launch Capium, connect any tool to the port (see cdp_connect.js)
const { launch } = require('capiumbrowser/playwright');
const browser = await launch({ seed: 200123, args: ['--remote-debugging-port=9242'] });
```

---

## Deployment

Capium runs identically local, in Docker, and on a VPS. For serverless one-shot scrapes there's a complete
**AWS Lambda** container recipe (headed under Xvfb, cold-start-hardened) in
[`examples/integrations/aws_lambda/`](examples/integrations/aws_lambda/).

Build your own image from pip — download the binary at build time with a BuildKit secret so the key never
lands in a layer:

```dockerfile
FROM python:3.12-slim
RUN pip install capiumbrowser playwright && python -m playwright install-deps chromium
RUN --mount=type=secret,id=capium_license \
    CAPIUM_LICENSE_KEY="$(cat /run/secrets/capium_license)" python -m capiumbrowser install
COPY your_script.py /app/
CMD ["python", "/app/your_script.py"]
```

```bash
DOCKER_BUILDKIT=1 docker build --secret id=capium_license,env=CAPIUM_LICENSE_KEY -t my-capium .
```

The Node image is the same shape (`npx capiumbrowser install` pre-fetches the binary at build
time; `CAPIUM_HOME=/opt/capium` keeps it out of `node_modules` so an `npm ci` never deletes it):

```dockerfile
FROM node:22-slim
ENV CAPIUM_HOME=/opt/capium
RUN npx -y playwright-core install-deps chromium
WORKDIR /app
COPY package*.json ./
RUN npm ci        # capiumbrowser + playwright-core (or puppeteer-core) from your package.json
RUN --mount=type=secret,id=capium_license \
    CAPIUM_LICENSE_KEY="$(cat /run/secrets/capium_license)" npx capiumbrowser install
COPY your_script.js .
CMD ["node", "your_script.js"]
```

On a headless Linux server, run the browser under a virtual display (`Xvfb :99` + `DISPLAY=:99`) so it
launches **headed**, which reads cleaner than headless.

---

## Platforms

| Platform | Distro tag | Notes |
|---|---|---|
| Windows x86_64 | `windows-x64` | Native GPU/fonts back a Windows persona flawlessly |
| macOS arm64 (Apple Silicon) | `macos-arm64` | M1–M4 by design (covers 2020+ Macs); a Windows persona uses installed Windows fonts for fallback |
| Linux x86_64 | `linux-x64` | Defaults to a Windows persona; supply Windows fonts for the cleanest result |
| Linux arm64 | `linux-arm64` | Same as Linux x64 for aarch64 hosts |

The SDK auto-detects your host and downloads the matching tag; macOS Intel and Windows ARM are **not**
published and raise a clear error. Capium currently targets **Chromium 152**.

---

## CLI & environment

```bash
python -m capiumbrowser info       # environment check: license + binary + deps + system libs
python -m capiumbrowser status     # license entitlements (plan, seats, live sessions, renewal)
python -m capiumbrowser version    # SDK version + the Chromium build it targets
python -m capiumbrowser install    # download the capium browser binary
SEED=200123 PLATFORM=linux PROXY="http://user:pass@host:port" GEOIP=1 HUMANIZE=1 \
  python -m capiumbrowser run https://example.com    # launch a demo browser (Ctrl-C to exit)
```

The Node SDK ships the same CLI:

```bash
npx capiumbrowser            # info — environment check (license + binary + drivers)
npx capiumbrowser status     # license entitlements
npx capiumbrowser install    # download the capium browser binary
npx capiumbrowser run URL    # demo launch (same SEED/PLATFORM/PROXY/... env vars)
```

`info` is the "what do I still need installed?" check — Playwright, the binary (path + version), the
license key, and (on Linux) required system libraries; it prints a fix for anything missing and exits
non-zero if the environment isn't ready. A bare `python -m capiumbrowser` runs `info`.

| Variable | Purpose |
|---|---|
| `CAPIUM_LICENSE_KEY` / `CAPIUM_LICENSE_SERVER` | license key (`cap_…`) + server (default `https://license.capzy.ai`) |
| `CAPIUM_BINARY` | exact path to the `capium` wrapper (skips download) |
| `CAPIUM_DOWNLOAD_URL` | direct archive URL (`{platform}`/`{version}` placeholders); unsigned escape hatch |
| `CAPIUM_HOME` / `CAPIUM_VERSION` | where distros extract / pin a binary version |
| `CAPIUM_PROXY` | default proxy URL used when `proxy="env"` |
| `CAPIUM_FONTS_DIR` / `CAPIUM_SUPPRESS_FONT_WARNING` | custom font dir / silence the font hint |
| `CAPIUM_DRIVER=patchright` | opt into the Patchright driver (default is plain Playwright) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `capium wrapper not found` | Set `CAPIUM_LICENSE_KEY` (to download), or `CAPIUM_BINARY`, or drop the distro beside the package. |
| `no license configured` | Set `CAPIUM_LICENSE_KEY`, pass `license_key=…`, or create `~/.capium/license` (`KEY=cap_…`). |
| `CapiumSeatLimitError` | Free tier is 1 concurrent session — close the other Capium browser (or upgrade the tier). |
| Still blocked on aggressive sites | Run **headed** (`headless=False` under Xvfb) + a **residential** proxy + `geoip=True` + `humanize=True`. Most blocks are IP reputation or a mismatched clock, not fingerprint. |
| FPJS `tampering: true` | Cross-OS persona on a mismatched host, or per-seed noise unmasked — run on a matching-OS host; `--fingerprint-noise=false` is the default. |
| "Windows persona but missing fonts" | Supply real `C:\Windows\Fonts\*.ttf` (see [fonts](#fonts)) or set `CAPIUM_SUPPRESS_FONT_WARNING=1`. |
| `os_mismatch: true` | A network/transport signal (genuine Chrome shows it too behind some proxies) — a routing concern, not the browser. |
| Headed browser won't start on a server | Run under `Xvfb` and export `DISPLAY=:99`. |

More: [docs.capiumbrowser.com](https://docs.capiumbrowser.com).

---

## FAQ

**Is this legal?** Capium is a browser built on open-source Chromium. Use it only where you're authorized to.
Automating systems without authorization, credential stuffing, and account-creation abuse are prohibited.

**Is it free?** The `capiumbrowser` Python package is open. The binary has a **free tier with 1 concurrent
session** using the same latest build; paid tiers raise the concurrent-session cap. See
[capiumbrowser.com](https://capiumbrowser.com/#pricing).

**Do I need a license key?** Yes — the binary is license-gated and fails closed. A free key (from the
dashboard) gives one concurrent session; a paid key raises the limit.

**How is this different from JS stealth plugins?** They inject JavaScript that modern ML detects. Capium
rewrites fingerprints in the Chromium source and compiles them in — there's no injected hook to catch.

**Will detection eventually catch this?** Bot detection is an arms race. Source-level patches are much harder
to detect than config-level ones, and Capium rebases onto new Chromium and ships updates as detection evolves.

**Can I use my own proxy?** Yes — HTTP/HTTPS and SOCKS5 are supported natively. Bring your own.

---

## Security

The SDK fetches the binary over an **authenticated** request — the license key travels in a header (over
TLS), never in the URL, and the request target is HMAC-signed. The response's **`X-Capium-SHA256`** is
verified against the downloaded bytes before anything is extracted, so a corrupted or tampered download is
rejected. The key is handed to the browser subprocess through the **environment**, never on argv.

---

## License

- **`capiumbrowser` SDKs** ([Python](capiumbrowser-python/) · [Node.js](capiumbrowser-node/)) — open; see [LICENSE](LICENSE).
- **Capium browser binary** (compiled Chromium) — licensed per concurrent session; requires an active key
  to download and run. Free tier available. See [capiumbrowser.com](https://capiumbrowser.com).

<p align="center"><sub><a href="https://capiumbrowser.com">Capium Browser</a> is a product of <a href="https://capzy.ai">Capzy</a>. Use responsibly and only where you are authorized to.</sub></p>
