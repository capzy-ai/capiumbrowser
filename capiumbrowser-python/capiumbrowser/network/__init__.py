"""
capiumbrowser.network -- proxy construction for the SDK.

  proxy   -- build the native `--proxy-server=scheme://user:pass@host:port` flag
             (HTTP/HTTPS/SOCKS5, inline creds, dict specs, env alias).

Geo coherence is resolved entirely inside the browser binary: passing `--geoip`
makes it pin WebRTC / timezone / geolocation / language to the egress IP (the proxy
exit if one is set, otherwise the host's own public IP), so there is no SDK-side probe.

`proxy` is re-exported from the top-level package, so `capiumbrowser.proxy` keeps working.
"""
from . import proxy

__all__ = ["proxy"]
