"""Scrapling + Capium: adaptive scraping with source-level stealth.

Scrapling handles parsing and element tracking; Capium supplies the stealth
Chromium. Scrapling wants a ws:// CDP endpoint, so we read it from Chrome's
/json/version after launch.

    pip install "scrapling[all]" capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...
"""
import asyncio
import json
import os
from urllib.request import urlopen

from scrapling.fetchers import StealthyFetcher

from capiumbrowser import launch_async

CDP_PORT = int(os.environ.get("CAPIUM_CDP_PORT", "9245"))


async def main():
    # 1. Launch Capium with a remote-debugging port.
    browser = await launch_async(
        seed=int(os.environ.get("CAPIUM_SEED", "54321")),
        platform=os.environ.get("CAPIUM_PLATFORM", "windows"),
        proxy=os.environ.get("CAPIUM_PROXY") or None,
        geoip=True,
        headless=True,
        args=[
            "--remote-debugging-port=%d" % CDP_PORT,
            "--remote-debugging-address=127.0.0.1",
        ],
    )

    # 2. Scrapling needs the ws:// debugger URL (not the http:// origin).
    info = json.loads(urlopen("http://127.0.0.1:%d/json/version" % CDP_PORT).read())
    ws_url = info["webSocketDebuggerUrl"]

    # 3. Fetch through the stealth browser over CDP.
    page = await StealthyFetcher.async_fetch("https://example.com", cdp_url=ws_url)
    print("Title:", page.css("title::text").get())
    print("Text :", page.css("p::text").getall())

    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
