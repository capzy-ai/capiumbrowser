<p align="center">
  <img src="https://raw.githubusercontent.com/capzy-ai/capiumbrowser/main/assets/capzy-banner.png" alt="Capium — stealth Chromium for Playwright and Puppeteer" width="820">
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/capiumbrowser"><img src="https://img.shields.io/npm/v/capiumbrowser?color=cb3837" alt="npm"></a>
  <img src="https://img.shields.io/badge/node-18%2B-brightgreen" alt="Node 18+">
  <img src="https://img.shields.io/badge/drivers-Playwright%20%C2%B7%20Puppeteer-45ba4b" alt="Playwright / Puppeteer">
  <a href="https://docs.capiumbrowser.com"><img src="https://img.shields.io/badge/docs-capiumbrowser.com-6741d9" alt="Docs"></a>
  <a href="https://capiumbrowser.com"><img src="https://img.shields.io/badge/website-capiumbrowser.com-1c7ed6" alt="Website"></a>
</p>

<h3 align="center">A stealth Chromium built to withstand bot detection — because it's a real browser.</h3>

<table><tr><td>
Not a patched config. Not a JavaScript injection. A real Chromium binary whose fingerprints are rewritten at the <strong>C++ source level</strong> and compiled in. Page scripts that hunt for injected hooks find nothing to catch — the values a site reads <em>are</em> the persona's values, produced by the engine. Drive it with the <strong>Playwright</strong> or <strong>Puppeteer</strong> API you already know.
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

**`npm install capiumbrowser playwright-core`** (or **`puppeteer-core`**) · CLI: `npx capiumbrowser`

> Using Python? The same browser ships as a [PyPI package](https://pypi.org/project/capiumbrowser/) with the same options.

- **Source-level C++ stealth** — User-Agent & UA-CH, WebGL/GPU, canvas, audio, screen, hardware, fonts, voices, WebRTC, `navigator.webdriver`, DevTools, pointer, client-rects — all rewritten **in the browser's own source**, below the JavaScript layer.
- **Coherent per-seed identities** — one integer **seed** derives a complete, self-consistent device (OS, GPU, cores, memory, screen, fonts, UA). Same seed ⇒ same machine, on any host, every run.
- **`humanize: true`** — attaches `page.humanMove` / `humanClick` / `humanType` / `humanScroll`: curved, human-timed mouse, keyboard, and scroll input.
- **`geoip: true`** — the binary resolves its own exit IP through your proxy and pins timezone, WebRTC IP, geolocation, and `navigator.languages` to match. The clock, locale, and IP all tell one story.
- **Plain drivers over CDP** — no patched driver, no init-script signature, no `Object.defineProperty` shim to detect. Update the engine with `npm i -U playwright-core` (or `puppeteer-core`).
- **Always the latest binary** — one license key fetches the newest checksum-verified build for your platform and reuses it thereafter.
- **Free tier — 1 concurrent session.** Paid tiers raise the concurrent-session cap. [Start free →](https://capiumbrowser.com)

```js
const { launchContext } = require('capiumbrowser');   // auto-detects the installed driver

const { browser, page } = await launchContext({
  seed: 200123,                                       // a coherent, repeatable device
  proxy: 'http://user:pass@host:port', geoip: true,   // exit IP + matching tz/geo/WebRTC
  humanize: true,                                     // human-like clicks/typing/scrolls
  url: 'https://fingerprint.com/demo/',
});

await page.humanType('#email', 'alex@example.com');
await page.humanClick('#submit');
await browser.close();
```

> The `capiumbrowser` **npm package is open**; the **Capium browser binary is licensed** per concurrent session. There's a **free tier with 1 concurrent session** — see [Licensing](#licensing).

---

## Table of contents

- [Install](#install) · [Why Capium](#why-capium) · [Licensing & tiers](#licensing)
- [What a persona reads](#what-a-persona-reads) · [How it works](#how-it-works)
- [API](#api) · [Options](#options) · [Personas & seeds](#personas--seeds) · [Fingerprint switches](#fingerprint-switches)
- [Human behavior](#human-behavior) · [Proxies & geo](#proxies--geo) · [Fonts](#fonts)
- [Framework integrations](#framework-integrations) · [Deployment](#deployment) · [Platforms](#platforms)
- [CLI](#cli--environment) · [Troubleshooting](#troubleshooting) · [FAQ](#faq) · [Security](#security) · [License](#license)

---

## Install

```bash
# With Playwright
npm install capiumbrowser playwright-core

# With Puppeteer
npm install capiumbrowser puppeteer-core
```

The driver is an **optional peer dependency** — install whichever you use (or both) and update
it independently. On Linux, install Chromium's OS libraries once:
`npx playwright-core install-deps chromium` (covers Puppeteer setups too).

You do **not** run `npx playwright install chromium` — Capium ships its own binary. On first
launch the SDK fetches the per-platform build from the license service (authenticated,
checksum-verified) and caches it under `~/.capium` (`CAPIUM_HOME` overrides — it deliberately
lives *outside* `node_modules`, so reinstalls never delete it).

**Migrating?** It's a one-line change — the returned object is a standard Playwright /
Puppeteer `Browser`:

```diff
- const { chromium } = require('playwright-core');
- const browser = await chromium.launch();
+ const { launch } = require('capiumbrowser/playwright');
+ const browser = await launch({ seed: 200123 });

  const page = await browser.newPage();
  await page.goto('https://example.com');   // the rest of your code is unchanged
```

```diff
- const puppeteer = require('puppeteer');
- const browser = await puppeteer.launch();
+ const { launch } = require('capiumbrowser/puppeteer');
+ const browser = await launch({ seed: 200123 });
```

> ⭐ **Star** [the repo](https://github.com/capzy-ai/capiumbrowser) to follow along — Capium tracks Chrome closely and ships new builds as detection evolves.

---

## Why Capium

- **Config-level stealth breaks.** `puppeteer-extra-plugin-stealth`, patched drivers, and
  friends inject JavaScript or flip flags. Every Chrome update breaks them, and modern
  anti-bot ML detects the patches themselves — the very act of hiding trips the alarm.
- **Capium patches Chromium source.** Fingerprints are modified at the C++ level and compiled
  into the binary. Detection sites see a real browser because it *is* one — no init script,
  no `toString` tampering, no CDP hooks to sniff.
- **Coherence is the product.** A convincing device isn't one clean signal; it's *every*
  signal telling the same story. Capium derives GPU, screen, fonts, UA-CH, timezone, locale,
  and WebRTC from a single seed + your proxy's geography, so nothing contradicts anything else.
- **Same behavior everywhere.** Local, Docker, VPS, Lambda — no environment-specific config.
- **Works with your stack.** Drop-in stealth for Crawlee, @playwright/test,
  puppeteer-cluster, and anything that speaks CDP. See [integrations](#framework-integrations).

Capium doesn't solve CAPTCHAs, and no stealth tool can promise you'll never see one. What a
coherent, real-browser fingerprint does is remove the automation tells that commonly *trigger*
challenges — it reduces friction, it doesn't guarantee a challenge-free session. No
CAPTCHA-solving services, no built-in proxy rotation: bring your own proxies and use the
driver API you already know.

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

   …or a file at `~/.capium/license` (chmod 600) with a `KEY=cap_…` line, or pass
   `launch({ licenseKey: 'cap_…' })`.

The **same key gates the binary download**. The key is passed to the browser **via the
environment**, never on the command line (so it can't leak through `ps`). Check entitlements
without spending a session:

```bash
npx capiumbrowser status
# plan: free   sessions_cap: 1   live_sessions: 0   period_end: ...
```

Handle license errors with typed error classes — `CapiumSeatLimitError`, `CapiumExpiredError`,
`CapiumServerDownError`, `CapiumConfigError` (all subclass `CapiumLicenseError` → `CapiumError`). Full model:
[docs.capiumbrowser.com](https://docs.capiumbrowser.com).

---

## What a persona reads

On a **matching-OS host** (a Windows persona on Windows, a macOS persona on macOS), a Capium persona reads
clean against a modern fingerprinting suite — with the correct GPU, fonts, and voices for the claimed device:

| Signal | Stock driver Chromium | Capium |
|---|---|---|
| `navigator.webdriver` | `true` | **not flagged** (source-level) |
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
> proxies/NATs too, so treat it as a routing concern, not a browser one.

---

## How it works

1. **You install** → `npm install capiumbrowser playwright-core` (or `puppeteer-core`). This
   downloads **nothing** but the SDK — the ~230 MB binary needs your license key, so it can't
   be fetched at npm-install time.
2. **First launch** → the license-gated binary auto-downloads for your platform
   (checksum-verified) and caches under `~/.capium`. It's fetched **lazily** on that first
   `launch()` — or eagerly with `npx capiumbrowser install`.
3. **Every later launch** → the cached binary is reused instantly; the plain driver starts it with your seed.
4. **Upgrade** → when a newer SDK bumps the target build, the next launch notices the cached
   binary is a different version, **removes it, and downloads the new one** — no manual reinstall.

The spoofing lives in the compiled binary — not injected via JavaScript, not set via a detectable CDP
`Emulation` call. Identity comes from one seed; proxy, geolocation, timezone, WebRTC, and locale are all
aligned to a single coherent story.

**Download mechanics.** The binary is fetched from the license service with a signed, path-based GET
(`/download/distro/chromium-v<version>/capiumbrowser-<os>-<arch>.tar.gz`): the key travels in the
`X-Capzy-License` header (never the URL) and the request path is HMAC-signed. The response's
`X-Capzy-SHA256` is verified against the streamed bytes before extraction, so a corrupted or tampered
archive is rejected. Env overrides: `CAPIUM_LICENSE_KEY` (or `~/.capium/license`), `CAPIUM_VERSION` (target
a specific build), `CAPIUM_BINARY` (use an exact local binary, skip download), `CAPIUM_DOWNLOAD_URL`
(unsigned direct URL escape hatch), `CAPIUM_HOME` (where builds cache). A missing platform, an unpublished
version (404), a rejected license (401/403), an unreachable server, or a checksum mismatch each throw a
distinct, typed `Capium*` error.

---

## API

Everything is async. The root import auto-detects the installed driver (Playwright preferred
when both are present); pick one explicitly via the subpaths:

```js
const capium = require('capiumbrowser');              // auto-detect
const pw     = require('capiumbrowser/playwright');   // Playwright explicitly
const pptr   = require('capiumbrowser/puppeteer');    // Puppeteer explicitly
```

| Function | Returns | Use for |
|---|---|---|
| `launch(options)` | `Browser` | full control; create your own contexts/pages (they default to `viewport: null`) |
| `launchContext(options)` | `{browser, context?, page}` | one-liner: open a page, optionally navigate + humanize |
| `launchPersistentContext(dir, options)` | Playwright: `BrowserContext` · Puppeteer: `Browser` | **persistent** cookies/localStorage/login across runs |
| `buildLaunchOptions(options)` | plain object | hand the driver's own `launch()` (or any framework) the ready-made `{executablePath, args, env, …}` |

```js
const { launch, launchPersistentContext } = require('capiumbrowser/playwright');

// Full control
const browser = await launch({ seed: 200123, platform: 'windows', headless: false });

// Proxy + coherent geo (HTTP/HTTPS/SOCKS5, inline creds)
const b2 = await launch({ seed: 200123, proxy: 'socks5://user:pass@host:port', geoip: true });

// Explicit timezone/locale always win over geoip auto-detection
const b3 = await launch({ seed: 200123, proxy: 'http://host:port', geoip: true, timezone: 'Europe/London' });

// Persistent profile — stays logged in, avoids the "always fresh incognito" tell; extensions need this
const ctx = await launchPersistentContext('profiles/acct1', {
  seed: 200123, platform: 'linux', extensionPaths: ['/path/to/unpacked-extension'],
});

// Bring your own flags — disable the defaults and build the command line yourself
const b4 = await launch({ stealthArgs: false, args: ['--fingerprint=200123', '--fingerprint-platform=linux'] });
```

```js
// Framework escape hatch: you hold the launch, Capium supplies the options
const { chromium } = require('playwright-core');
const { buildLaunchOptions } = require('capiumbrowser/playwright');
const b5 = await chromium.launch(await buildLaunchOptions({ seed: 200123 }));
```

**Puppeteer specifics** — the same options, with Puppeteer-shaped defaults applied for you:
`defaultViewport: null` (the page tracks the real window), `--enable-automation` stripped from
the default args, and persistence via `launch({ userDataDir })` (Puppeteer has no separate
persistent-context API, so `launchPersistentContext(dir, opts)` is sugar for exactly that).

---

## Options

Unless noted, all of these work on **`launch`**, **`launchContext`**, and
**`launchPersistentContext`** (which forward everything to `launch`). Same options as the
Python SDK, in camelCase.

### Identity & rendering

| Option | Type | Default | Description |
|---|---|---|---|
| `seed` | `number` \| `null` | `null` | Persona seed → a complete coherent device. `null` = fresh random seed each launch. The range selects the OS family (see [Personas & seeds](#personas--seeds)). |
| `platform` | `string` | `"windows"` | Spoofed OS: `"windows"` \| `"macos"` \| `"linux"`. Sets `--fingerprint-platform` and picks the seed range if you didn't. |
| `headless` | `boolean` | `false` | Headed is recommended (reads cleaner). On a server, run headed under Xvfb. |
| `stealthArgs` | `boolean` | `true` | Apply the default coherent fingerprint flags. Set `false` to build the whole command line yourself via `args`. |
| `args` | `string[]` | — | Extra raw Chrome flags appended verbatim (see [Fingerprint switches](#fingerprint-switches)). |

### Proxy, geo & locale

| Option | Type | Default | Description |
|---|---|---|---|
| `proxy` | `string` \| `object` | — | HTTP/HTTPS/SOCKS5 URL with inline creds, or `{server, username, password, bypass}`. Credentials are URL-encoded and the **binary authenticates natively** (SOCKS5 RFC 1929; preemptive HTTP auth) — commas & special characters are safe. |
| `geoip` | `boolean` \| `null` | `null` | Geo coherence, resolved inside the binary. **`null`/omitted — OFF**: no lookup runs, even with a proxy (a proxy alone doesn't trigger it, so proxied launches aren't slowed). **`true`** — ON: pins timezone/geo/WebRTC/`navigator.languages` to the egress (proxy exit, or the host IP if proxyless). **`false`** — explicit opt-out. |
| `timezone` | `string` | — | IANA tz (e.g. `"America/New_York"`) → `--timezone`. **Overrides** `geoip`. |
| `locale` | `string` | — | BCP-47 (e.g. `"en-US"`) → `--lang` + `--accept-lang`. **Overrides** `geoip`. |

### Profiles & extensions

| Option | Type | Default | Description |
|---|---|---|---|
| `userDataDir` | `string` | — | **`launchPersistentContext` only** (first positional arg). Directory where cookies/localStorage/cache persist across runs. |
| `extensionPaths` | `string[]` \| `string` | — | Unpacked Chrome extension directory(ies). Extensions require a **persistent context**. |

### License

| Option | Type | Default | Description |
|---|---|---|---|
| `licenseKey` | `string` | — | `cap_…` key. Falls back to `CAPIUM_LICENSE_KEY` env / `~/.capium/license`. Passed to the binary via the environment, never argv. |
| `licenseServer` | `string` | — | Override the license server (default `https://license.capzy.ai`). |
| `licenseThroughProxy` | `boolean` | `false` | Route license/session calls through `--proxy-server` instead of direct. |
| `licensePreflight` | `boolean` | `true` | Fail fast with a typed `CapiumConfigError` when no key is configured, before spinning up a browser. Set `false` for a dev build that runs without enforcement. |

### `launchContext` only

| Option | Type | Default | Description |
|---|---|---|---|
| `url` | `string` | — | If set, navigate the returned page to it (`domcontentloaded`, 60 s) as a driven navigation. |
| `humanize` | `boolean` | `false` | Attach `page.humanMove` / `humanClick` / `humanType` / `humanScroll` / `humanDwell` (see [Human behavior](#human-behavior)). |
| `humanPreset` | `string` | `"default"` | Pace of humanized input: `"default"` (natural) or `"careful"` (slower, more deliberate). |

### Binary & driver passthrough

| Option | Type | Default | Description |
|---|---|---|---|
| `binary` | `string` | — | Exact path to the capium launch target — skips discovery/download (same as `CAPIUM_BINARY`). |
| *(rest)* | — | — | Every remaining option is forwarded to the driver's own `launch()` — `slowMo`, `timeout`, Playwright's `viewport`, Puppeteer's `defaultViewport`/`ignoreDefaultArgs`, etc. Persistent contexts default to `viewport: null` unless you pass one. |

> Prefer the friendly options (`proxy`, `geoip`, `timezone`, `locale`) over raw `args` — reach for
> `args` only when a convenience option doesn't cover the surface. Environment variables that affect
> every launch are in [CLI & environment](#cli--environment).

---

## Personas & seeds

A **persona** is a complete, self-consistent device deterministically derived from one integer **seed**.
The seed range selects the OS family (or pass `platform` and Capium picks the range for you):

| OS family | Seed range | `platform` |
|---|---|---|
| Windows | `10000–99999` | `"windows"` |
| macOS (Apple Silicon) | `100000–199999` | `"macos"` |
| Linux | `200000–299999` | `"linux"` |

```js
await launch({ seed: 200123 });   // a specific, repeatable device
await launch({});                 // random seed each launch (still fully coherent)
```

> **Tip — pin a seed per account.** A fresh random seed every visit looks like a new device each time,
> which is suspicious when you keep hitting the same site from the same IP. A fixed seed reads as a
> returning visitor. **And match the persona to the host OS** — a macOS persona is flawless on a Mac and a
> Windows persona on Windows, because the host's real text-rasterizer and GPU back the claim.

### Launch every persona — and persist per account

```js
const { launchContext, launchPersistentContext } = require('capiumbrowser');

// One coherent device per OS: pick platform + any stable seed
for (const [platform, seed] of [['windows', 200111], ['macos', 200222], ['linux', 200333]]) {
  const { browser, page } = await launchContext({ seed, platform, url: 'https://browserscan.net/' });
  await browser.close();                       // non-persistent: close the browser
}

// Persist a logged-in account across runs — give it a profile DIRECTORY (persistent-only;
// launch()/launchContext() are always throwaway).
const ctx = await launchPersistentContext('capium-profiles/acct-a', { seed: 210001, platform: 'windows' });
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto('https://example.com');        // cookies/localStorage persist in the profile dir
await ctx.close();

// A fleet: each account its own coherent device AND its own profile
for (const [name, seed] of Object.entries({ 'acct-a': 210001, 'acct-b': 210002, 'acct-c': 210003 })) {
  const c = await launchPersistentContext(`capium-profiles/${name}`, { seed, platform: 'macos' });
  await c.close();
}
```

Full runnable version (personas, persistent profiles, a fleet, proxy+geo, full control):
[`examples/profiles.js`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/profiles.js).

---

## Fingerprint switches

The SDK sets the essentials from `seed`/`platform`. Everything below is available for precise control —
pass any through `args: [...]` (or `stealthArgs: false` to build the whole command line yourself):

```js
await launch({ seed: 200123, args: [
  '--fingerprint-hardware-concurrency=8',
  '--fingerprint-screen-width=2560', '--fingerprint-screen-height=1440',
]});
```

**Identity**

| Switch | What it controls |
|---|---|
| `--fingerprint=<seed>` | Master seed → the whole coherent device. |
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

Most of these have friendly SDK equivalents (`timezone`, `locale`, `proxy`, `geoip`). The full
per-switch matrix lives in the [docs](https://docs.capiumbrowser.com).

---

## Human behavior

Behavioral anti-bot systems score *how* you move, not just what you send. Pass
**`humanize: true`** to `launchContext()` (or call `human.humanize(page)` yourself) and human
input helpers are attached to the page:

```js
const { browser, page } = await launchContext({ seed: 200123, humanize: true, url: 'https://example.com' });
await page.humanClick('#login');           // curved cursor along a bezier path, then a human press
await page.humanType('#user', 'alice');    // per-key typing with realistic timing & think-pauses
await page.humanScroll(1200);              // eased, incremental scrolling — not one jump
await page.humanDwell();                   // idle a human-plausible moment
```

- The cursor follows a **curved bezier path** through randomized way-points with variable speed.
- Keystrokes carry **per-key jitter** with occasional longer think-pauses.
- Scrolling moves in **eased increments** that decay toward the target.

Two presets tune the pace: `"default"` (natural) and `"careful"` (slower). It's pure driver
input (`page.mouse` / `page.keyboard`) — no CDP tricks — and works with both Playwright and
Puppeteer pages. Helpers are also importable directly:

```js
const { human } = require('capiumbrowser');
await human.click(page, '#login');
await human.typeText(page, '#user', 'alice', 'careful');
```

---

## Proxies & geo

**No proxy provider and no credentials ship with the package** — you supply your own.

```js
await launch({ seed: 200123, proxy: 'http://user:pass@host:port', geoip: true });
await launch({ seed: 200123, proxy: 'socks5://user:pass@host:port' });   // RFC 1929 auth
await launch({ proxy: { server: 'http://h:8080', username: 'u', password: 'p', bypass: 'localhost,*.internal' } });
```

`proxy` accepts an HTTP/HTTPS or SOCKS5 URL (inline credentials) or a
`{server, username, password, bypass}` object. Credentials are passed **inline** to the Capium
binary — which authenticates natively (SOCKS5 RFC 1929; preemptive HTTP `Proxy-Authorization`) — and are
URL-encoded so special characters (commas in `groups-X,country-Y` usernames included) can't truncate the
proxy string into a real-IP-leaking `DIRECT` fallback.

Geo coherence is resolved **inside the binary** at launch, which geolocates the egress IP
and pins timezone, geolocation, WebRTC IP, and `navigator.languages` — so the WebRTC IP equals the
site-visible IP and the clock/locale match the egress geography. There's no SDK-side network call. `geoip` is
tri-state:

- **omitted / `null` (default) — OFF.** No geo lookup runs, **even with a proxy** — a proxy alone does not
  trigger it (the lookup is a blocking egress round-trip we don't pay unless you ask). Pass `geoip: true`
  to opt into proxy-exit coherence.
- **`geoip: true` — ON.** Geolocates the egress and pins timezone/geolocation/WebRTC/`navigator.languages` to
  it — the **proxy exit** when a proxy is set, else the **host's own public IP**.
- **`geoip: false` — explicit opt-out.** Forwards `--geoip=false` so the in-binary resolver is unambiguously off.

Explicit `timezone` / `locale` always win (they're set at launch, so they also cover the HTTP
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
Book, or drop them into `~/Library/Fonts/` (picked up immediately).

**macOS persona on a non-Mac host** — needs genuine Apple fonts (SF Pro, Helvetica Neue, …)
from a Mac you own, placed in the same font locations. This is the hardest cross-OS
direction — a macOS persona reads cleanest on a real Mac.

Copy proprietary fonts only between machines you hold licenses for. On Linux,
`CAPIUM_FONTS_DIR` adds a custom font directory; `CAPIUM_SUPPRESS_FONT_WARNING=1` silences the
"missing Windows fonts" hint once you've supplied them.

---

## Framework integrations

Capium is a Chromium fork, so any Chromium automation tool works — point it at the binary and add the
persona flags. Runnable examples live in
[`examples/integrations/`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/):

| Framework | Example |
|---|---|
| [Crawlee](https://github.com/apify/crawlee) (`PlaywrightCrawler`) | [`crawlee.js`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/crawlee.js) |
| [@playwright/test](https://playwright.dev/docs/intro) | [`playwright_test.spec.js`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/playwright_test.spec.js) |
| [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) | [`puppeteer_cluster.js`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/puppeteer_cluster.js) |
| any CDP tool | [`cdp_connect.js`](https://github.com/capzy-ai/capiumbrowser/tree/main/examples/integrations/cdp_connect.js) |

Two patterns cover them all:

```js
// 1) Framework launches our binary directly (Crawlee, puppeteer-cluster, @playwright/test):
//    buildLaunchOptions() returns {executablePath, args, env, ...} for the framework's launcher.
const { buildLaunchOptions } = require('capiumbrowser/playwright');   // or /puppeteer
const launchOptions = await buildLaunchOptions({ seed: 200123, platform: 'windows' });

// 2) Capium launches first, the framework connects over CDP (AI agents, remote tools):
const { launch } = require('capiumbrowser/playwright');
const browser = await launch({ seed: 200123, geoip: true, args: ['--remote-debugging-port=9242'] });
// point anything at http://127.0.0.1:9242 — all stealth flags are already set
```

---

## Deployment

Capium runs identically local, in Docker, and on a VPS. Build your own image — download the
binary at build time with a BuildKit secret so the key never lands in a layer, and keep it
under `CAPIUM_HOME` so `npm ci` can never delete it:

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
published and throw a clear error. Capium currently targets **Chromium 152**.

---

## CLI & environment

```bash
npx capiumbrowser                  # environment check: license + binary + drivers ("what do I still need?")
npx capiumbrowser status           # license entitlements (plan, seats, live sessions, renewal)
npx capiumbrowser version          # SDK version + the Chromium build it targets
npx capiumbrowser install          # download the capium browser binary
SEED=200123 PLATFORM=linux PROXY="http://user:pass@host:port" GEOIP=1 HUMANIZE=1 \
  npx capiumbrowser run https://example.com    # launch a demo browser (Ctrl-C to exit)
```

`npx capiumbrowser` (bare, = `info`) checks the drivers, the binary (path + version), and the
license key; it prints a fix for anything missing and exits non-zero if the environment isn't ready.

| Variable | Purpose |
|---|---|
| `CAPIUM_LICENSE_KEY` / `CAPIUM_LICENSE_SERVER` | license key (`cap_…`) + server (default `https://license.capzy.ai`) |
| `CAPIUM_BINARY` | exact path to the capium launch target (skips download) |
| `CAPIUM_DOWNLOAD_URL` | direct archive URL (`{platform}`/`{version}` placeholders); unsigned escape hatch |
| `CAPIUM_HOME` / `CAPIUM_VERSION` | where distros cache (default `~/.capium`) / pin a binary version |
| `CAPIUM_INLINE_PROXY_AUTH=0` | legacy CDP proxy-auth path (only for a binary lacking the preemptive-auth patch) |
| `CAPIUM_FONTS_DIR` / `CAPIUM_SUPPRESS_FONT_WARNING` | custom font dir / silence the font hint (Linux) |

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `capium binary not found` | Set `CAPIUM_LICENSE_KEY` (to auto-download), or `CAPIUM_BINARY`, or run `npx capiumbrowser install`. |
| `no license configured` | Set `CAPIUM_LICENSE_KEY`, pass `licenseKey: '…'`, or create `~/.capium/license` (`KEY=cap_…`). |
| `playwright-core is not installed` | `npm install playwright-core` (or `puppeteer-core`) — the driver is a peer dependency you choose. |
| `CapiumSeatLimitError` | Free tier is 1 concurrent session — close the other Capium browser (or upgrade the tier). |
| Still blocked on aggressive sites | Run **headed** (`headless: false` under Xvfb) + a **residential** proxy + `geoip: true` + humanized input. Most blocks are IP reputation or a mismatched clock, not fingerprint. |
| Intermittent 403s on reCAPTCHA Enterprise sites | Prefer the **Playwright** front-end — Puppeteer's CDP protocol usage leaks more automation signals (a Puppeteer limitation, not a Capium one). |
| FPJS `tampering: true` | Cross-OS persona on a mismatched host, or per-seed noise unmasked — run on a matching-OS host; `--fingerprint-noise=false` is the default. |
| "Windows persona but missing fonts" | Supply real `C:\Windows\Fonts\*.ttf` (see [Fonts](#fonts)) or set `CAPIUM_SUPPRESS_FONT_WARNING=1`. |
| `os_mismatch: true` | A network/transport signal (genuine Chrome shows it too behind some proxies) — a routing concern, not the browser. |
| Headed browser won't start on a server | Run under `Xvfb` and export `DISPLAY=:99`. |

More: [docs.capiumbrowser.com](https://docs.capiumbrowser.com).

---

## FAQ

**Is this legal?** Capium is a browser built on open-source Chromium. Use it only where you're authorized to.
Automating systems without authorization, credential stuffing, and account-creation abuse are prohibited.

**Is it free?** The `capiumbrowser` npm package is open. The binary has a **free tier with 1 concurrent
session** using the same latest build; paid tiers raise the concurrent-session cap. See
[capiumbrowser.com](https://capiumbrowser.com/#pricing).

**Do I need a license key?** Yes — the binary is license-gated and fails closed. A free key (from the
dashboard) gives one concurrent session; a paid key raises the limit.

**Playwright or Puppeteer?** Both are first-class. Playwright is the recommended default (its native
launch path is the one measured cleanest, and it matters on reCAPTCHA-Enterprise-heavy sites);
Puppeteer works great when your stack is already built on it.

**How is this different from JS stealth plugins?** They inject JavaScript that modern ML detects. Capium
rewrites fingerprints in the Chromium source and compiles them in — there's no injected hook to catch.

**Will detection eventually catch this?** Bot detection is an arms race. Source-level patches are much harder
to detect than config-level ones, and Capium rebases onto new Chromium and ships updates as detection evolves.

**Can I use my own proxy?** Yes — HTTP/HTTPS and SOCKS5 are supported natively. Bring your own.

**Does this work with Python?** Yes — the same browser ships as a
[PyPI package](https://pypi.org/project/capiumbrowser/) with the same options (snake_case).

---

## Security

The SDK fetches the binary over an **authenticated** request — the license key travels in a header (over
TLS), never in the URL, and the request target is HMAC-signed. The response's checksum is
verified against the downloaded bytes before anything is extracted, so a corrupted or tampered download is
rejected. The key is handed to the browser subprocess through the **environment**, never on argv.

---

## License

- **`capiumbrowser` npm package** — open; see [LICENSE](https://github.com/capzy-ai/capiumbrowser/blob/main/LICENSE).
- **Capium browser binary** (compiled Chromium) — licensed per concurrent session; requires an active key
  to download and run. Free tier available. See [capiumbrowser.com](https://capiumbrowser.com).

<p align="center"><sub><a href="https://capiumbrowser.com">Capium Browser</a> is a product of <a href="https://capzy.ai">Capzy</a>. Use responsibly and only where you are authorized to.</sub></p>
