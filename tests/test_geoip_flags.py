"""Unit tests for the SDK geoip flag tri-state (capiumbrowser.browser._proxy_and_geo_args).

Regression for the 2026-09 contract change: a proxy ALONE must NOT enable geoip (that added a
blocking egress round-trip to every proxied launch). --geoip is the sole trigger now.
"""
import asyncio

from capiumbrowser import browser
from capiumbrowser import browser_async


def _flags(spec, geoip):
    _, out = browser._proxy_and_geo_args(spec, binpath="", geoip_on=geoip, display=None)
    return out


def test_default_none_adds_no_geoip_even_with_proxy():
    out = _flags("http://u:p@h:1", geoip=None)
    assert any(a.startswith("--proxy-server=") for a in out), "proxy flag expected"
    assert not any(a == "--geoip" or a.startswith("--geoip=") for a in out), \
        "a proxy alone must NOT enable geoip (default is OFF)"


def test_true_adds_geoip():
    out = _flags("http://u:p@h:1", geoip=True)
    assert "--geoip" in out


def test_false_adds_explicit_optout():
    out = _flags("http://u:p@h:1", geoip=False)
    assert "--geoip=false" in out


def test_no_proxy_no_geoip_by_default():
    out = _flags(None, geoip=None)
    assert out == []


def test_async_mirror_matches_sync():
    async def _run(spec, geoip):
        _, out = await browser_async._proxy_and_geo_args_async(spec, binpath="",
                                                               geoip_on=geoip, display=None)
        return out
    assert "--geoip" in asyncio.run(_run("http://u:p@h:1", True))
    assert not any(a.startswith("--geoip") for a in asyncio.run(_run("http://u:p@h:1", None)))
    assert "--geoip=false" in asyncio.run(_run(None, False))
