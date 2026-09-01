"""Crawl4AI + Capium: LLM-ready web crawling with source-level stealth.

Crawl4AI does extraction and markdown conversion; Capium supplies the stealth
Chromium. Capium launches with a remote-debugging port and Crawl4AI attaches
over CDP in `browser_mode="cdp"`.

    pip install crawl4ai capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...
"""
import asyncio
import os

from crawl4ai import AsyncWebCrawler, BrowserConfig, CrawlerRunConfig

from capiumbrowser import launch_async

CDP_PORT = int(os.environ.get("CAPIUM_CDP_PORT", "9243"))


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

    # 2. Attach Crawl4AI to the stealth browser over CDP.
    browser_config = BrowserConfig(browser_mode="cdp",
                                   cdp_url="http://127.0.0.1:%d" % CDP_PORT)
    run_config = CrawlerRunConfig()

    async with AsyncWebCrawler(config=browser_config) as crawler:
        result = await crawler.arun("https://example.com", config=run_config)
        print("Extracted %d chars of markdown" % len(result.markdown))
        print(result.markdown[:500])

    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
