"""
capiumbrowser.network.proxy -- proxy URL construction for the SDK.

  build_proxy_arg(spec)  ->  "--proxy-server=..." flag with inline credentials,
                             or None for no proxy. Handles HTTP/HTTPS/SOCKS5,
                             dict specs, string URLs, and the DataImpulse alias.
"""
import os
import urllib.parse

def _encode_cred(s: str) -> str:
    """Full RFC-3986 percent-encoding of one --proxy-server userinfo field.

    Encode EVERYTHING outside urllib's unreserved set — ',', ';', '=', '+', ':',
    '@' all become %XX. The reserved chars matter because Chromium's --proxy-server
    value has its own grammar: ',' and ';' separate proxy rules and '=' is the
    scheme=proxy delimiter, so a raw one splits the config into garbage and the
    tunnel dies with ERR_TUNNEL_CONNECTION_FAILED (the Apify "groups-X,country-Y,
    session-Z" username failure).

    The capium binary percent-DECODES the inline user:pass@ before it authenticates,
    so the proxy receives the original literal characters. Encode-in-the-SDK /
    decode-in-the-binary is the canonical pairing — nothing is left raw.

    IDEMPOTENT: unquote() first, so a credential that ALREADY arrived percent-encoded
    (e.g. a proxy dict whose username came from urlsplit — which does NOT decode) isn't
    double-encoded (',' -> '%2C' -> '%252C'; the binary decodes only once, so the proxy
    would see a literal "%2C" -> ERR_TUNNEL_CONNECTION_FAILED). Mirrors the CDP path
    (_to_playwright_dict), which unquotes too, so inline and CDP normalize identically.
    """
    return urllib.parse.quote(urllib.parse.unquote(str(s)), safe="")


def _proxy_url(scheme: str, user: str, pw: str, host: str, port: int) -> str:
    """Build scheme://encoded-user:encoded-pass@host:port."""
    return f"{scheme}://{_encode_cred(user)}:{_encode_cred(pw)}@{host}:{int(port)}"


def build_proxy_arg(spec) -> "str | None":
    """Return a --proxy-server=... flag for the capium binary, or None for no proxy.

    Accepted forms:
      None / "" / "none" / "0" / False     ->  no proxy
      "http://user:pass@host:port"         ->  HTTP/HTTPS proxy with credentials
      "socks5://user:pass@host:port"       ->  SOCKS5 with credentials
      "socks5://host:port"                 ->  SOCKS5, no auth
      {"server": "scheme://host:port",     ->  dict spec; username/password are
       "username": "...", "password": "…"}     optional — no-auth if omitted
    """
    if not spec or spec in ("none", "0", False):
        return None

    # Dict spec: {"server": "scheme://host:port", "username": ..., "password": ...}
    if isinstance(spec, dict):
        server = spec.get("server", "")
        parsed = urllib.parse.urlsplit(server if "://" in server else "http://" + server)
        scheme = parsed.scheme or "http"
        user   = spec.get("username") or ""
        pw     = spec.get("password") or ""
        if user:
            return "--proxy-server=" + _proxy_url(scheme, user, pw, parsed.hostname, parsed.port)
        return f"--proxy-server={server}"

    # String URL: urlsplit percent-decodes username/password for us, then we
    # re-encode via _encode_cred so the result is always safe for --proxy-server.
    raw    = str(spec)
    parsed = urllib.parse.urlsplit(raw if "://" in raw else "http://" + raw)
    scheme = parsed.scheme or "http"
    if parsed.username:
        return "--proxy-server=" + _proxy_url(
            scheme, parsed.username, parsed.password or "", parsed.hostname, parsed.port
        )
    port_str = f":{parsed.port}" if parsed.port else ""
    return f"--proxy-server={scheme}://{parsed.hostname}{port_str}"


# ---- proxy channel selection --------------------------------------------------------------
# Everything now goes through the native inline --proxy-server flag. The capium binary
# authenticates from the inline user:pass@ itself:
#   * SOCKS5  -> RFC 1929 username/password in the handshake (socks_connect_job.cc)
#   * HTTP/S  -> PREEMPTIVE Proxy-Authorization on the FIRST CONNECT
#                (http_proxy_client_socket.cc; capium-preemptive-proxy-auth.patch)
# Preemptive auth means the proxy never has to answer 407, which closes the reactive-auth
# retry loop (net::ERR_TOO_MANY_RETRIES) that inline credentials -- especially country-
# targeted / special-char usernames like "groups-X,country-Y,session-Z" -- used to trigger.
# Inline is also MORE correct than the old CDP path: CDP-auth mangled comma usernames and
# dropped the country target (e.g. __cr.us resolved to a GB exit); inline honors them.
#
# The legacy Playwright proxy= dict (CDP auth, answers the 407 over CDP) remains only as an
# escape hatch for a binary WITHOUT the preemptive patch -- opt in with CAPIUM_INLINE_PROXY_AUTH=0.
def binary_supports_inline_proxy_auth():
    """Whether the capium binary authenticates from inline --proxy-server credentials.

    Default True: the capium binary decodes the inline user:pass@ itself (SOCKS5 RFC 1929 +
    preemptive HTTP Proxy-Authorization), so ALL proxies use the native --proxy-server flag.
    Set CAPIUM_INLINE_PROXY_AUTH=0 to force the legacy CDP-auth path for credentialed
    HTTP/HTTPS (only needed on a binary that lacks the preemptive-proxy-auth patch).
    """
    v = os.environ.get("CAPIUM_INLINE_PROXY_AUTH")
    if v is not None:
        return v.strip().lower() in ("1", "true", "yes", "on")
    return True


def _spec_parts(spec):
    """(scheme, host, port, user, pass) from a dict spec or a string URL. Creds are the raw
    (already percent-decoded) values."""
    if isinstance(spec, dict):
        server = spec.get("server", "") or ""
        u = urllib.parse.urlsplit(server if "://" in server else "http://" + server)
        return (u.scheme or "http"), u.hostname, u.port, (spec.get("username") or ""), (spec.get("password") or "")
    raw = str(spec)
    u = urllib.parse.urlsplit(raw if "://" in raw else "http://" + raw)
    return (u.scheme or "http"), u.hostname, u.port, (u.username or ""), (u.password or "")


def _spec_is_socks(spec):
    return _spec_parts(spec)[0].lower().startswith("socks")


def _spec_bypass(spec):
    """Optional proxy-bypass list from a dict spec (the Playwright 'bypass' key).

    Comma-separated hosts/patterns that should connect DIRECT, skipping the proxy
    (e.g. "localhost,*.internal"). Only dict specs carry it; a string proxy URL has
    nowhere to put it. Mirrors cloakbrowser: inline -> --proxy-bypass-list=<v>,
    CDP -> the dict's own 'bypass' field."""
    if isinstance(spec, dict):
        return spec.get("bypass") or None
    return None


def _to_playwright_dict(spec):
    """Normalize a spec into a Playwright proxy dict {server, username?, password?}. Credentials
    are passed RAW — Playwright handles CDP-auth escaping itself, so nothing is re-encoded."""
    scheme, host, port, user, pw = _spec_parts(spec)
    server = "%s://%s" % (scheme, host)
    if port:
        server += ":%d" % int(port)
    d = {"server": server}
    if user:
        d["username"] = urllib.parse.unquote(user)
        d["password"] = urllib.parse.unquote(pw or "")
    bypass = _spec_bypass(spec)
    if bypass:
        d["bypass"] = bypass
    return d


def resolve_proxy_config(spec, inline_auth=None):
    """Return (proxy_kwargs, extra_args) for launching the capium binary.

    proxy_kwargs -> splatted into Playwright's launch (e.g. {"proxy": {...}}); extra_args ->
    appended to the Chromium arg list. Exactly one carries the proxy for any spec:
      * DEFAULT: everything -> extra_args (native inline --proxy-server; binary self-auths)
      * escape hatch (CAPIUM_INLINE_PROXY_AUTH=0): credentialed HTTP/HTTPS -> proxy_kwargs
        (Playwright CDP auth), for a binary lacking the preemptive-proxy-auth patch. SOCKS5
        can NEVER go this way (Chrome must receive it inline), so SOCKS always stays inline.

    A dict spec's optional "bypass" (comma-separated DIRECT hosts) is carried too:
    --proxy-bypass-list=<v> on the inline paths, or the dict's own "bypass" on CDP."""
    if not spec or spec in ("none", "0", False):
        return {}, []
    if inline_auth is None:
        inline_auth = binary_supports_inline_proxy_auth()
    _, _, _, user, _ = _spec_parts(spec)
    has_creds = bool(user)
    if _spec_is_socks(spec) or not has_creds or inline_auth:
        arg = build_proxy_arg(spec)
        if not arg:
            return {}, []
        extra = [arg]
        bypass = _spec_bypass(spec)
        if bypass:
            extra.append(f"--proxy-bypass-list={bypass}")
        return {}, extra
    return {"proxy": _to_playwright_dict(spec)}, []


