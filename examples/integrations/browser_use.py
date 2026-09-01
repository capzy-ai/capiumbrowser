"""browser-use + Capium: an AI agent with source-level stealth fingerprints.

browser-use drives the AI agent logic; Capium supplies the stealth Chromium so
the agent is better equipped for sites that gate bots with Cloudflare / reCAPTCHA /
DataDome. Capium launches headless with a remote-debugging port, and browser-use attaches over CDP.

    pip install browser-use capiumbrowser
    export CAPIUM_LICENSE_KEY=cap_...      # the binary is license-gated
    export OPENAI_API_KEY=sk-...           # or swap for another LLM provider

Persona/proxy come from the env (CAPIUM_SEED / CAPIUM_PLATFORM / CAPIUM_PROXY),
so the same script can pin one coherent identity per account.
"""
import asyncio
import os

from browser_use import Agent, BrowserSession, ChatOpenAI

from capiumbrowser import launch_async

CDP_PORT = int(os.environ.get("CAPIUM_CDP_PORT", "9242"))


async def main():
    # 1. Launch Capium (handles the binary, license, and coherent stealth args).
    browser = await launch_async(
        seed=int(os.environ.get("CAPIUM_SEED", "54321")),
        platform=os.environ.get("CAPIUM_PLATFORM", "windows"),
        proxy=os.environ.get("CAPIUM_PROXY") or None,
        geoip=True,                       # pin timezone/WebRTC/geo to the exit IP
        headless=True,
        args=[
            "--remote-debugging-port=%d" % CDP_PORT,
            "--remote-debugging-address=127.0.0.1",
        ],
    )

    # 2. Point browser-use at the stealth browser over CDP.
    session = BrowserSession(cdp_url="http://127.0.0.1:%d" % CDP_PORT)

    # 3. Run the agent -- every page it opens is a Capium stealth page.
    agent = Agent(
        task="Go to https://www.google.com and search for 'browser automation'",
        llm=ChatOpenAI(model="gpt-4o-mini"),
        browser_session=session,
    )
    result = await agent.run()
    print(result)

    await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
