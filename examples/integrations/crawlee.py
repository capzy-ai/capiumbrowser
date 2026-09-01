"""Crawlee + Capium: stealth crawling with PlaywrightCrawler.

A custom BrowserPlugin swaps Crawlee's default Chromium for Capium's patched
binary, so the whole crawl runs behind source-level fingerprint patches. Capium
handles fingerprints in the engine, so Crawlee's header generator is disabled.

    pip install capiumbrowser "crawlee[playwright]"
    export CAPIUM_LICENSE_KEY=cap_...
"""
import asyncio
import os

from typing_extensions import override

from capiumbrowser.config import get_default_stealth_args, find_binary
from capiumbrowser.download import ensure_binary

from crawlee.browsers import (
    BrowserPool,
    PlaywrightBrowserController,
    PlaywrightBrowserPlugin,
)
from crawlee.crawlers import PlaywrightCrawler, PlaywrightCrawlingContext

SEED = int(os.environ.get("CAPIUM_SEED", "54321"))
PLATFORM = os.environ.get("CAPIUM_PLATFORM", "windows")


class CapiumBrowserPlugin(PlaywrightBrowserPlugin):
    """PlaywrightBrowserPlugin that launches Capium's patched Chromium."""

    @override
    async def new_browser(self) -> PlaywrightBrowserController:
        if not self._playwright:
            raise RuntimeError("Playwright browser plugin is not initialized.")

        # ensure_binary() downloads the license-gated build if it isn't present;
        # find_binary() alone would raise if it's missing.
        binary_path = ensure_binary()
        stealth_args = get_default_stealth_args(seed=SEED, platform=PLATFORM)

        launch_options = dict(self._browser_launch_options)
        launch_options.pop("executable_path", None)
        existing_args = list(launch_options.pop("args", []))
        launch_options["args"] = [*existing_args, *stealth_args]

        return PlaywrightBrowserController(
            browser=await self._playwright.chromium.launch(
                executable_path=binary_path,
                **launch_options,
            ),
            max_open_pages_per_browser=1,
            # Capium sets fingerprints at the binary level -- no JS header spoofing.
            header_generator=None,
        )


async def main() -> None:
    crawler = PlaywrightCrawler(
        max_requests_per_crawl=10,
        browser_pool=BrowserPool(plugins=[CapiumBrowserPlugin()]),
    )

    @crawler.router.default_handler
    async def request_handler(context: PlaywrightCrawlingContext) -> None:
        context.log.info("Processing %s ..." % context.request.url)
        title = await context.page.title()
        await context.push_data({"url": context.request.url, "title": title})
        await context.enqueue_links()

    await crawler.run(["https://example.com"])


if __name__ == "__main__":
    asyncio.run(main())
