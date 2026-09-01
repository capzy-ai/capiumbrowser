"""AWS Lambda handler for one-off Capium stealth-browser invocations.

Always runs **headed** via the Xvfb display started by `lambda-entrypoint.sh`
(a headed engine is the cleanest against fingerprinting; see the SDK README).

Event schema (all fields except `url` are optional):

    Persona / launch options (passed to capiumbrowser.launch_async):
        url                 str              required, the page to scrape (http/https only)
        seed                int              persona seed (default from CAPIUM_SEED)
        platform            str              "windows" | "macos" | "linux"
        proxy               str|dict         http://user:pass@host:port  or  Playwright proxy dict
        geoip               bool             False -- auto timezone+locale from the exit IP
        timezone            str              IANA tz, e.g. "America/New_York"
        locale              str              BCP-47, e.g. "en-US"
        viewport            {width,height}   emulated viewport (default: real window size)
        user_agent          str              custom UA (rare -- Capium sets a coherent one)

    Navigation options (passed to page.goto):
        wait_until          str              "load"|"domcontentloaded"|"networkidle"|"commit"
                                              default "domcontentloaded"
        goto_timeout_ms     int              30000

    Post-navigation waits (run in this order if specified):
        smart_wait                       bool ON by default if no other wait is set.
                                              Polls document.outerHTML.length and bails when it
                                              hasn't changed for `dom_stable_ms`. Handles lazy
                                              hydration and async chunks, and ignores network
                                              chatter (beacons/long-poll) that never mutates DOM.
        dom_stable_ms                    int  1500   -- how long DOM must be quiet
        max_settle_ms                    int  15000  -- hard cap on smart_wait
        wait_for_load_state              str  "load"|"domcontentloaded"|"networkidle"
        wait_for_load_state_timeout_ms   int  30000
        wait_for_selector                str  CSS or XPath selector
        wait_for_selector_state          str  "attached"|"detached"|"visible"|"hidden", default "visible"
        wait_for_selector_timeout_ms     int  30000
        wait_ms                          int  fixed pause in ms (page.wait_for_timeout)

    Capture options:
        screenshot              bool         True
        full_page_screenshot    bool         False -- capture the entire scrollable page

    Retry orchestration:
        retries     int  default 1. Number of retry attempts after the first
                          failure. Set to 0 to fail fast. Retried errors:
                            ERR_CERT_*                -> retry with --ignore-certificate-errors
                            Timeout exceeded          -> retry with a 90s goto budget
                            ERR_CONNECTION_TIMED_OUT  -> same as Timeout
                          Not retried (unrecoverable): ERR_NAME_NOT_RESOLVED,
                          ERR_SSL_PROTOCOL_ERROR, generic ERR_CONNECTION_REFUSED.

Returns:
    {"title": ..., "url": ..., "html": ..., "screenshot_b64"?: ...}
"""

from __future__ import annotations

import asyncio
import base64
import ipaddress
import json
import logging
import os
import socket
import subprocess
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from capiumbrowser import launch_async

logger = logging.getLogger("capiumbrowser.lambda")
logger.setLevel(logging.INFO)

# Persona defaults -- override per-invoke via the event, or globally via env.
_DEFAULT_SEED = int(os.environ.get("CAPIUM_SEED", "54321"))
_DEFAULT_PLATFORM = os.environ.get("CAPIUM_PLATFORM", "windows")


def _validate_url(url: str) -> None:
    """Reject non-HTTP schemes and URLs that resolve to private/internal IPs."""
    parsed = urlparse(url)
    if parsed.scheme.lower() not in ("http", "https"):
        raise ValueError(
            f"Only http:// and https:// URLs are supported, got: {parsed.scheme!r}"
        )
    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname")
    try:
        infos = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC, socket.SOCK_STREAM)
    except socket.gaierror:
        raise ValueError(f"Cannot resolve hostname: {hostname}")
    for info in infos:
        addr = ipaddress.ip_address(info[4][0])
        if not addr.is_global:
            raise ValueError("URLs targeting private/internal networks are blocked")


def _diag_snapshot() -> str:
    """Capture Xvfb status, Xvfb log, X11 socket state, and env for error reports."""
    parts = []
    try:
        r = subprocess.run(["pgrep", "-fa", "Xvfb"], capture_output=True, text=True)
        parts.append(f"pgrep Xvfb: rc={r.returncode} stdout={r.stdout.strip()!r}")
    except Exception as e:
        parts.append(f"pgrep failed: {e}")
    try:
        r = subprocess.run(["ls", "-la", "/tmp/.X11-unix"], capture_output=True, text=True)
        parts.append(f"ls /tmp/.X11-unix:\n{r.stdout}{r.stderr}")
    except Exception as e:
        parts.append(f"ls /tmp/.X11-unix failed: {e}")
    try:
        log = Path("/tmp/Xvfb.log").read_text()
        parts.append(f"/tmp/Xvfb.log:\n{log}")
    except Exception as e:
        parts.append(f"Xvfb log unreadable: {e}")
    parts.append(f"env: DISPLAY={os.environ.get('DISPLAY')!r} HOME={os.environ.get('HOME')!r}")
    return "\n".join(parts)


def handler(event: dict, context: Any) -> dict:
    return asyncio.run(_run(event))


def _build_launch_kwargs(event: dict) -> dict:
    """Translate the event dict into kwargs for launch_async.

    Only forwards keys explicitly present so Capium's own defaults apply when a
    field is absent. Persona (seed/platform) falls back to the env defaults.
    """
    kwargs: dict = {
        "headless": False,  # always headed via Xvfb
        "seed": event.get("seed", _DEFAULT_SEED),
        "platform": event.get("platform", _DEFAULT_PLATFORM),
        "args": [
            # Lambda /dev/shm is ~64 MB -- Chromium crashes mid-render without this.
            "--disable-dev-shm-usage",
            # Lambda's restricted process model can't fork from Chromium's zygote.
            "--no-zygote",
            *event.get("_strategy_args", []),
        ],
    }
    for key in ("proxy", "geoip", "timezone", "locale"):
        if key in event:
            kwargs[key] = event[key]
    return kwargs


def _page_kwargs(event: dict) -> dict:
    """browser.new_page() kwargs for optional viewport / user_agent overrides."""
    kwargs: dict = {}
    if "viewport" in event:
        kwargs["viewport"] = event["viewport"]
    if "user_agent" in event:
        kwargs["user_agent"] = event["user_agent"]
    return kwargs


async def _smart_wait(page, dom_stable_ms: int = 1500, max_settle_ms: int = 15000) -> None:
    """Wait until the document HTML hasn't changed for `dom_stable_ms`.

    A generic stopping condition for at-scale scraping when you can't tune
    selectors per site. More robust than `networkidle` because it ignores
    network activity that doesn't mutate the DOM (analytics beacons,
    long-poll, websockets, web-vitals streams).
    """
    js = f"""
    (() => {{
        if (!window.__capium_settle) {{
            window.__capium_settle = {{ len: -1, since: Date.now() }};
        }}
        const cur = document.documentElement.outerHTML.length;
        const s = window.__capium_settle;
        if (cur !== s.len) {{
            s.len = cur;
            s.since = Date.now();
            return false;
        }}
        return (Date.now() - s.since) >= {int(dom_stable_ms)};
    }})()
    """
    try:
        await page.wait_for_function(js, timeout=max_settle_ms, polling=200)
    except Exception:
        # Hit the max_settle_ms cap -- return what we have rather than fail the invoke.
        logger.warning("smart_wait hit max_settle_ms=%d cap", max_settle_ms)


_EXPLICIT_WAIT_KEYS = ("wait_for_load_state", "wait_for_selector", "wait_ms")


async def _post_nav_waits(page, event: dict) -> None:
    """Run waits in priority order. smart_wait is the default unless the caller
    asked for a more specific stopping condition."""
    explicit = any(k in event for k in _EXPLICIT_WAIT_KEYS)
    if event.get("smart_wait", not explicit):
        await _smart_wait(
            page,
            dom_stable_ms=event.get("dom_stable_ms", 1500),
            max_settle_ms=event.get("max_settle_ms", 15000),
        )
    if "wait_for_load_state" in event:
        await page.wait_for_load_state(
            event["wait_for_load_state"],
            timeout=event.get("wait_for_load_state_timeout_ms", 30000),
        )
    if "wait_for_selector" in event:
        await page.wait_for_selector(
            event["wait_for_selector"],
            state=event.get("wait_for_selector_state", "visible"),
            timeout=event.get("wait_for_selector_timeout_ms", 30000),
        )
    if "wait_ms" in event:
        await page.wait_for_timeout(event["wait_ms"])


async def _launch_with_retry(event: dict, attempts: int = 3, backoff_s: float = 0.3):
    """Retry launch_async up to `attempts` times with linear backoff.

    Lambda cold-start storms occasionally race Xvfb readiness or hit transient
    Chromium spawn failures. The failure is fast (~0.5s) so retries are cheap,
    and a retry on a now-warm container almost always succeeds. Pairs with the
    lock-cleanup + socket-poll in lambda-entrypoint.sh.
    """
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            return await launch_async(**_build_launch_kwargs(event))
        except Exception as e:
            last_err = e
            logger.warning("launch attempt %d/%d failed: %s",
                           i + 1, attempts, str(e)[:200])
            if i + 1 < attempts:
                await asyncio.sleep(backoff_s * (i + 1))  # 0.3s, 0.6s
    raise last_err  # type: ignore[misc]


def _classify_error(err: Exception) -> dict | None:
    """Map a Playwright error to a retry-strategy override dict, or None if the
    error is unrecoverable.

    Match on str(e) because Playwright errors carry their codes inside the
    message; there's no stable structured `.error_code` to rely on.
    """
    msg = str(err)
    if "ERR_CERT" in msg:
        return {"_strategy_args": ["--ignore-certificate-errors"], "goto_timeout_ms": 60000}
    if ("Timeout" in msg and "exceeded" in msg) or "ERR_CONNECTION_TIMED_OUT" in msg:
        return {"goto_timeout_ms": 90000, "max_settle_ms": 25000}
    return None


async def _attempt_scrape(url: str, event: dict) -> dict:
    """One self-contained scrape attempt: launch, navigate, wait, capture, close.

    Each attempt relaunches the browser -- uniform across strategies (the
    cert-bypass strategy *requires* a relaunch because --ignore-certificate-errors
    is a CLI arg, not a per-context switch), and the relaunch cost is fine on the
    slow path.
    """
    browser = await _launch_with_retry(event)
    try:
        page = await browser.new_page(**_page_kwargs(event))
        await page.goto(
            url,
            wait_until=event.get("wait_until", "domcontentloaded"),
            timeout=event.get("goto_timeout_ms", 30000),
        )
        _validate_url(page.url)

        await _post_nav_waits(page, event)
        _validate_url(page.url)

        result: dict = {
            "title": await page.title(),
            "url": page.url,
            "html": await page.content(),
        }
        if event.get("screenshot", True):
            png = await page.screenshot(full_page=event.get("full_page_screenshot", False))
            result["screenshot_b64"] = base64.b64encode(png).decode()
        return result
    finally:
        try:
            await browser.close()
        except Exception:
            pass


def _raise_with_history(err: Exception, history: list[dict]) -> None:
    """Surface a final failure with a retry_history block embedded in the error
    message, so callers see what was tried before bailing."""
    diag = _diag_snapshot()
    if history:
        diag = "retry_history: " + json.dumps(history, default=str) + "\n\n" + diag
    logger.error("scrape failed (after %d retries): %s\nDIAG:\n%s",
                 len(history), err, diag)
    raise RuntimeError(f"scrape failed: {err}\n--- DIAG ---\n{diag}") from err


async def _run(event: dict) -> dict:
    """Top-level scrape with strategy-based retry orchestration.

    First attempt uses the event verbatim. If it fails with a classifiable
    error (cert / timeout), retry with that strategy's overrides merged in.
    `retries` bounds the number of strategy retries (default 1; 0 disables it).
    """
    url = event["url"]
    _validate_url(url)
    event = {k: v for k, v in event.items() if k not in ("extra_args", "_strategy_args")}
    retries_left = max(0, int(event.get("retries", 1)))
    history: list[dict] = []
    current_event = event

    while True:
        try:
            return await _attempt_scrape(url, current_event)
        except Exception as e:
            if retries_left <= 0:
                _raise_with_history(e, history)
            strategy = _classify_error(e)
            if strategy is None:
                _raise_with_history(e, history)
            history.append({
                "attempt": len(history) + 1,
                "error": str(e)[:300],
                "strategy": strategy,
            })
            logger.warning("attempt %d failed (%s); retrying with strategy=%s",
                           len(history), str(e)[:120], strategy)
            merged_args = (list(current_event.get("_strategy_args", []))
                           + list(strategy.get("_strategy_args", [])))
            current_event = {**current_event, **strategy, "_strategy_args": merged_args}
            retries_left -= 1
