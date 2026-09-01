"""LangChain + Capium: load pages behind bot detection into LangChain Documents.

LangChain's PlaywrightURLLoader hardcodes chromium.launch() with no hook for a
custom binary, so this uses Capium directly as a stealth document loader that
yields LangChain Document objects.

    pip install langchain-core capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...
"""
import asyncio
import os

from langchain_core.documents import Document

from capiumbrowser import launch_async


async def load_urls_stealth(urls, **launch_kwargs):
    """Load URLs through a Capium stealth browser; return LangChain Documents."""
    browser = await launch_async(
        seed=int(os.environ.get("CAPIUM_SEED", "54321")),
        platform=os.environ.get("CAPIUM_PLATFORM", "windows"),
        proxy=os.environ.get("CAPIUM_PROXY") or None,
        geoip=True,
        headless=True,
        **launch_kwargs,
    )
    page = await browser.new_page()
    docs = []
    try:
        for url in urls:
            await page.goto(url, wait_until="domcontentloaded")
            text = await page.evaluate("document.body.innerText")
            title = await page.title()
            docs.append(Document(page_content=text,
                                 metadata={"source": url, "title": title}))
    finally:
        await browser.close()
    return docs


async def main():
    urls = ["https://example.com", "https://httpbin.org/html"]
    for doc in await load_urls_stealth(urls):
        print("--- %s (%s) ---" % (doc.metadata["title"], doc.metadata["source"]))
        print(doc.page_content[:300])
        print()


if __name__ == "__main__":
    asyncio.run(main())
