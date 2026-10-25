"""Unit tests for the SDK geoip flag tri-state (capiumbrowser.browser._proxy_and_geo_args).

Contract as of 1.3.1: geoip=None (the default) enables --geoip WHENEVER A PROXY IS SET and
stays off otherwise. An uncorrected host timezone under a proxied identity (UTC on a server
against a residential exit) is a far stronger detection signal than the lookup's one-off
launch latency, which is why the 2026-09 "default always off" contract was reversed.
Explicit False still opts out with --geoip=false (honored first by the binary).
"""
import asyncio

from capiumbrowser import browser
from capiumbrowser import browser_async


def _flags(spec, geoip):
    _, out = browser._proxy_and_geo_args(spec, binpath="", geoip_on=geoip, display=None)
    return out


def test_default_none_enables_geoip_with_proxy():
    out = _flags("http://u:p@h:1", geoip=None)
    assert any(a.startswith("--proxy-server=") for a in out), "proxy flag expected"
    assert "--geoip" in out, \
        "a proxy must enable geoip by default (exit-coherent timezone/geo/WebRTC)"
    assert not any(a.startswith("--geoip=") for a in out)


def test_true_adds_geoip():
    out = _flags("http://u:p@h:1", geoip=True)
    assert "--geoip" in out


def test_true_without_proxy_adds_geoip():
    out = _flags(None, geoip=True)
    assert "--geoip" in out


def test_false_adds_explicit_optout():
    out = _flags("http://u:p@h:1", geoip=False)
    assert "--geoip=false" in out
    assert "--geoip" not in out


def test_no_proxy_no_geoip_by_default():
    out = _flags(None, geoip=None)
    assert out == []


def test_async_mirror_matches_sync():
    async def _run(spec, geoip):
        _, out = await browser_async._proxy_and_geo_args_async(spec, binpath="",
                                                               geoip_on=geoip, display=None)
        return out
    assert "--geoip" in asyncio.run(_run("http://u:p@h:1", True))
    assert "--geoip" in asyncio.run(_run("http://u:p@h:1", None))
    assert not any(a.startswith("--geoip") for a in asyncio.run(_run(None, None)))
    assert "--geoip=false" in asyncio.run(_run(None, False))
