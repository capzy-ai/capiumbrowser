"""Unit tests for capiumbrowser.network.proxy -- --proxy-server construction + auth-channel
selection. Pure logic, no browser. Guards the inline-credential encoding (the Apify
"groups-X,country-Y,session-Z" comma-username bug) and the inline-vs-CDP routing.
"""
from capiumbrowser.network import proxy


# ---- build_proxy_arg: no-proxy sentinels ------------------------------------------------
def test_no_proxy_sentinels():
    for spec in (None, "", "none", "0", False):
        assert proxy.build_proxy_arg(spec) is None, spec


# ---- build_proxy_arg: string URLs -------------------------------------------------------
def test_http_url_with_creds():
    arg = proxy.build_proxy_arg("http://user:pass@host.example:8080")
    assert arg == "--proxy-server=http://user:pass@host.example:8080"


def test_socks5_no_auth_passthrough():
    assert proxy.build_proxy_arg("socks5://gw.example:1080") == \
        "--proxy-server=socks5://gw.example:1080"


def test_bare_hostport_defaults_to_http():
    assert proxy.build_proxy_arg("host.example:3128") == "--proxy-server=http://host.example:3128"


# ---- credential encoding: the comma-username failure mode -------------------------------
def test_comma_username_is_percent_encoded():
    # ',' / '=' in the userinfo would otherwise split Chromium's --proxy-server grammar.
    arg = proxy.build_proxy_arg("http://groups-1,country-us,session-9:pw@h:1")
    assert "groups-1%2Ccountry-us%2Csession-9" in arg
    assert ",country-us" not in arg  # no raw comma leaked into the flag


def test_encoding_is_idempotent():
    # An already-encoded credential (e.g. from a dict whose value was pre-escaped) must not
    # double-encode: %2C -> %2C, never %252C (the binary decodes exactly once).
    spec = {"server": "http://h:1", "username": "a%2Cb", "password": "p"}
    arg = proxy.build_proxy_arg(spec)
    assert "a%2Cb" in arg and "%252C" not in arg


# ---- dict specs -------------------------------------------------------------------------
def test_dict_with_creds():
    arg = proxy.build_proxy_arg({"server": "http://h:8080", "username": "u", "password": "p"})
    assert arg == "--proxy-server=http://u:p@h:8080"


def test_dict_without_creds():
    assert proxy.build_proxy_arg({"server": "socks5://h:1080"}) == "--proxy-server=socks5://h:1080"


# ---- resolve_proxy_config: inline (default) vs CDP escape hatch --------------------------
def test_resolve_inline_default():
    kwargs, extra = proxy.resolve_proxy_config("http://u:p@h:1", inline_auth=True)
    assert kwargs == {}
    assert extra == ["--proxy-server=http://u:p@h:1"]


def test_resolve_socks_always_inline_even_with_cdp_flag():
    # SOCKS can never go via the Playwright CDP dict -- Chrome must receive it inline.
    kwargs, extra = proxy.resolve_proxy_config("socks5://u:p@h:1080", inline_auth=False)
    assert kwargs == {}
    assert extra and extra[0].startswith("--proxy-server=socks5://")


def test_resolve_cdp_escape_hatch_for_credentialed_http():
    kwargs, extra = proxy.resolve_proxy_config("http://u:p@h:1", inline_auth=False)
    assert extra == []
    assert kwargs["proxy"]["server"] == "http://h:1"
    assert kwargs["proxy"]["username"] == "u" and kwargs["proxy"]["password"] == "p"


def test_resolve_bypass_list_on_inline():
    kwargs, extra = proxy.resolve_proxy_config(
        {"server": "http://h:8080", "bypass": "localhost,*.internal"}, inline_auth=True)
    assert "--proxy-bypass-list=localhost,*.internal" in extra


def test_resolve_no_proxy():
    assert proxy.resolve_proxy_config(None) == ({}, [])
