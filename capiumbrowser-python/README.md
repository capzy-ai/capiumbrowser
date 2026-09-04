<p align="center">
  <img src="https://raw.githubusercontent.com/capzy-ai/capiumbrowser/main/assets/capzy-banner.png" alt="Capium — stealth Chromium for Playwright" width="820">
</p>

<p align="center">
  <a href="https://pypi.org/project/capiumbrowser/"><img src="https://img.shields.io/pypi/v/capiumbrowser?color=2b8a3e" alt="PyPI"></a>
  <img src="https://img.shields.io/badge/python-3.8%2B-blue" alt="Python 3.8+">
  <img src="https://img.shields.io/badge/driver-Playwright-45ba4b" alt="Playwright">
  <a href="https://docs.capiumbrowser.com"><img src="https://img.shields.io/badge/docs-capiumbrowser.com-6741d9" alt="Docs"></a>
  <a href="https://capiumbrowser.com"><img src="https://img.shields.io/badge/website-capiumbrowser.com-1c7ed6" alt="Website"></a>
</p>

<h3 align="center">A stealth Chromium built to withstand bot detection — because it's a real browser.</h3>

<table><tr><td>
Not a patched config. Not a JavaScript injection. A real Chromium binary whose fingerprints are rewritten at the <strong>C++ source level</strong> and compiled in. Page scripts that hunt for injected hooks find nothing to catch — the values a site reads <em>are</em> the persona's values, produced by the engine. Drive it with the <strong>Playwright</strong> API you already know.
</td></tr></table>

<p align="center">
  <sub>Say hi to <b>Capzy</b> 🕵️ — the stealth little guy who helps your automation blend in.</sub>
</p>

<p align="center">
  <a href="https://capiumbrowser.com">capiumbrowser.com</a> ·
  <a href="https://docs.capiumbrowser.com">Documentation</a> ·
  <a href="https://capiumbrowser.com/#pricing">Pricing</a> ·
  <a href="https://capiumbrowser.com/#demo">Demo</a> ·
  <a href="https://github.com/capzy-ai/capiumbrowser/tree/main/examples">Examples</a>
</p>

---

**`pip install capiumbrowser`** — `import capiumbrowser` · CLI: `python -m capiumbrowser`

> Using Node.js? The same browser ships as an [npm package](https://www.npmjs.com/package/capiumbrowser) for Playwright *and* Puppeteer.

- **Source-level C++ stealth** — User-Agent & UA-CH, WebGL/GPU, canvas, audio, screen, hardware, fonts, voices, WebRTC, `navigator.webdriver`, DevTools, pointer, client-rects — all rewritten **in the browser's own source**, below the JavaScript layer.
- **Coherent per-seed identities** — one integer **seed** derives a complete, self-consistent device (OS, GPU, cores, memory, screen, fonts, UA). Same seed ⇒ same machine, on any host, every run.
- **`humanize=True`** — ordinary `page.click` / `fill` / `type` become curved, human-timed mouse, keyboard, and scroll. One flag, and interactions look human rather than scripted.
- **`geoip=True`** — the binary resolves its own exit IP through your proxy and pins timezone, WebRTC IP, geolocation, and `navigator.languages` to match. The clock, locale, and IP all tell one story.
- **Plain Playwright over CDP** — no patched driver, no init-script signature, no `Object.defineProperty` shim to detect. Update the engine with `pip install -U playwright`.
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

> The `capiumbrowser` **Python package is open**; the **Capium browser binary is licensed** per concurrent session. There's a **free tier with 1 concurrent session** — see [Licensing](#licensing).

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
python -m capiumbrowser install     # ...or skip it: the first launch() downloads the binary for you.
```

That same key both **authorizes the download** and **licenses the browser**, and it's passed to the binary
through the environment — never on the command line. The download is checksum-verified before anything runs
and cached (under `~/.capium`), so it's fetched once and reused. Run `python -m capiumbrowser` (the `info`
check) to see your license, the installed build, and anything still missing.

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

1. **You install** → `pip install capiumbrowser`. This downloads **nothing** but the Python package — the
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
`launch_persistent_context_async`).

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

---

## Parameters

Every parameter the SDK accepts. Unless noted, all of these work on **`launch`**,
**`launch_context`**, and **`launch_persistent_context`** (and their `_async` twins) — `launch_context`
and `launch_persistent_context` forward everything to `launch`.

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
[`examples/profiles.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/profiles.py).

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

**Copying Windows fonts to a Linux host** (Windows persona on Linux) — copy the whole font
folder from any real Windows machine you own; it covers the required set (Segoe UI, Segoe UI
Light, Calibri, Marlett, MS UI Gothic, Franklin Gothic, Consolas, Courier New) and more:

```bash
# on the Linux box:
mkdir -p ~/.local/share/fonts/windows
# from the Windows machine (PowerShell):
scp C:\Windows\Fonts\* user@linuxbox:~/.local/share/fonts/windows/
# back on the Linux box:
fc-cache -f
```

The distro also ships **`capium-install-fonts.sh`**, which installs the free baseline
(emoji/CJK + the Carlito/Caladea/Liberation substitutes) via apt and then checks for the
required Windows set. Once the fonts resolve, the `capium` wrapper **auto-enables**
`--fingerprint-windows-font-metrics` — no flag needed.

**Copying Windows fonts to a macOS host** — install the same `.ttf`/`.ttc` files via Font
Book, or drop them into `~/Library/Fonts/` (picked up immediately). Calibri/Cambria are the
highest-value ones for text metrics.

**macOS persona on a non-Mac host** — needs genuine Apple fonts (SF Pro, Helvetica Neue, …)
from a Mac you own, placed in the same font locations. This is the hardest cross-OS
direction — a macOS persona reads cleanest on a real Mac.

Copy proprietary fonts only between machines you hold licenses for. On Linux,
`CAPIUM_FONTS_DIR` adds a custom font directory; `CAPIUM_SUPPRESS_FONT_WARNING=1` silences the
"missing Windows fonts" hint once you've supplied them. Full per-OS guide: [docs](https://docs.capiumbrowser.com).

---

## Framework integrations

Capium is a Chromium fork, so any Chromium automation tool works — point it at the binary and add the
persona flags. Runnable examples live in [`examples/integrations/`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/):

| Framework | Language | Example |
|---|---|---|
| [Selenium](https://github.com/SeleniumHQ/selenium) | Python | [`selenium.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/selenium.py) |
| [undetected-chromedriver](https://github.com/ultrafunkamsterdam/undetected-chromedriver) | Python | [`undetected_chromedriver.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/undetected_chromedriver.py) |
| [browser-use](https://github.com/browser-use/browser-use) | Python | [`browser_use.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/browser_use.py) |
| [Crawl4AI](https://github.com/unclecode/crawl4ai) | Python | [`crawl4ai.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/crawl4ai.py) |
| [Crawlee](https://github.com/apify/crawlee-python) | Python | [`crawlee.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/crawlee.py) |
| [Scrapling](https://github.com/D4Vinci/Scrapling) | Python | [`scrapling.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/scrapling.py) |
| [LangChain](https://github.com/langchain-ai/langchain) | Python | [`langchain_loader.py`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/langchain_loader.py) |
| [agent-browser](https://github.com/nichochar/agent-browser) | Shell | [`agent_browser.sh`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/agent_browser.sh) |

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

---

## Deployment

Capium runs identically local, in Docker, and on a VPS. For serverless one-shot scrapes there's a complete
**AWS Lambda** container recipe (headed under Xvfb, cold-start-hardened) in
[`examples/integrations/aws_lambda/`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/aws_lambda/).

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

- **`capiumbrowser` Python package** (this directory) — open; see [LICENSE](LICENSE).
- **Capium browser binary** (compiled Chromium) — licensed per concurrent session; requires an active key
  to download and run. Free tier available. See [capiumbrowser.com](https://capiumbrowser.com).

<p align="center"><sub><a href="https://capiumbrowser.com">Capium Browser</a> is a product of <a href="https://capzy.ai">Capzy</a>. Use responsibly and only where you are authorized to.</sub></p>
