#!/usr/bin/env python3
"""Launching personas and persistent profiles.

A capium identity is one integer SEED -> a complete, coherent device (OS, GPU, cores,
memory, screen, fonts, UA). The persona OS is chosen with platform=. Same seed + same
platform => the same machine every run, on any host.

Two independent ideas, often combined:
  * PERSONA   = platform + seed   (WHAT the device looks like)
  * PROFILE   = user_data_dir     (WHERE its cookies/logins/state persist between runs)

Persistence lives ONLY in launch_persistent_context — launch()/launch_context() always use a
throwaway temp profile.

    pip install capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...        # the binary is license-gated
    python profiles.py
"""
from capiumbrowser import launch, launch_context, launch_persistent_context


# 1) The three OS personas. Pick platform + any stable integer seed.
def each_platform():
    for platform, seed in (("windows", 200111), ("macos", 200222), ("linux", 200333)):
        browser, ctx, page = launch_context(seed=seed, platform=platform, headless=True,
                                             url="https://browserscan.net/")
        print(f"{platform:8} seed={seed}  UA={page.evaluate('navigator.userAgent')}")
        browser.close()   # non-persistent: close the browser


# 2) A PERSISTENT profile — one directory per identity keeps it logged in across runs
#    (and clears the FingerprintJS "incognito" tell a fresh temp profile raises).
#    NOTE: launch_persistent_context returns a CONTEXT (no Browser) — close the context.
def persistent_account(profile_dir="~/capium-profiles/acct-a", seed=210001, platform="windows"):
    ctx = launch_persistent_context(profile_dir, seed=seed, platform=platform, headless=False)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://example.com")
    # ... log in / do work; cookies + localStorage persist in profile_dir for next time ...
    ctx.close()


# 3) A FLEET: many accounts, each its own coherent device AND its own profile dir.
def account_fleet():
    accounts = {"acct-a": 210001, "acct-b": 210002, "acct-c": 210003}
    for name, seed in accounts.items():
        ctx = launch_persistent_context(f"~/capium-profiles/{name}", seed=seed, platform="macos")
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto("https://example.com")
        print(f"{name} ready (seed={seed})")
        ctx.close()


# 4) Persona + proxy + geo coherence + a persistent profile, all together.
def proxied_persistent(profile_dir="~/capium-profiles/proxied", seed=200999):
    ctx = launch_persistent_context(
        profile_dir, seed=seed, platform="windows",
        proxy="http://user:pass@host:port",   # inline creds (HTTP/HTTPS/SOCKS5); commas ok
        geoip=True,                            # opt in: pin tz/geo/WebRTC/lang to the proxy exit
    )
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto("https://browserscan.net/")
    ctx.close()


# 5) Full control: launch() -> Browser, build your own contexts/pages.
def full_control(seed=200123, platform="linux"):
    browser = launch(seed=seed, platform=platform, headless=True)
    page = browser.new_page()
    page.goto("https://example.com")
    browser.close()


# Async twins exist for all of the above: launch_async / launch_context_async /
# launch_persistent_context_async (same arguments).

if __name__ == "__main__":
    each_platform()
