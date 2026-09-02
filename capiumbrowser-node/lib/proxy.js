/**
 * proxy -- proxy URL construction for the SDK.
 *
 *   buildProxyArg(spec)  ->  "--proxy-server=..." flag with inline credentials,
 *                            or null for no proxy. Handles HTTP/HTTPS/SOCKS5,
 *                            object specs and string URLs.
 */
'use strict';

const UNRESERVED = /^[A-Za-z0-9\-._~]$/;

/**
 * Lenient percent-decode (Python urllib.parse.unquote semantics): valid %XX sequences are
 * decoded, anything malformed (a lone '%') is left as-is. decodeURIComponent would throw.
 */
function lenientUnquote(s) {
  return String(s).replace(/%([0-9A-Fa-f]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16)));
}

/**
 * Full RFC-3986 percent-encoding of one --proxy-server userinfo field.
 *
 * Encode EVERYTHING outside the unreserved set -- ',', ';', '=', '+', ':', '@' all become
 * %XX. The reserved chars matter because Chromium's --proxy-server value has its own
 * grammar: ',' and ';' separate proxy rules and '=' is the scheme=proxy delimiter, so a raw
 * one splits the config into garbage and the tunnel dies with ERR_TUNNEL_CONNECTION_FAILED
 * (the Apify "groups-X,country-Y,session-Z" username failure).
 *
 * The capium binary percent-DECODES the inline user:pass@ before it authenticates, so the
 * proxy receives the original literal characters. Encode-in-the-SDK / decode-in-the-binary
 * is the canonical pairing -- nothing is left raw.
 *
 * IDEMPOTENT: unquote first, so a credential that ALREADY arrived percent-encoded isn't
 * double-encoded (',' -> '%2C' -> '%252C'; the binary decodes only once, so the proxy would
 * see a literal "%2C" -> ERR_TUNNEL_CONNECTION_FAILED). Mirrors the CDP path
 * (toDriverProxy), which unquotes too, so inline and CDP normalize identically.
 */
function encodeCred(s) {
  const raw = lenientUnquote(s);
  let out = '';
  for (const ch of raw) {
    if (UNRESERVED.test(ch)) {
      out += ch;
    } else {
      // encode as UTF-8 bytes
      for (const b of Buffer.from(ch, 'utf8')) {
        out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
      }
    }
  }
  return out;
}

function proxyUrl(scheme, user, pw, host, port) {
  return `${scheme}://${encodeCred(user)}:${encodeCred(pw)}@${host}:${Math.trunc(Number(port))}`;
}

/**
 * (scheme, host, port, user, pass) from an object spec or a string URL. Creds are the raw
 * (already percent-decoded) values.
 */
function specParts(spec) {
  if (spec && typeof spec === 'object') {
    const server = spec.server || '';
    const u = new URL(server.includes('://') ? server : 'http://' + server);
    return {
      scheme: (u.protocol || 'http:').replace(/:$/, '') || 'http',
      host: u.hostname,
      port: u.port ? Number(u.port) : null,
      user: spec.username || '',
      pass: spec.password || '',
    };
  }
  const raw = String(spec);
  const u = new URL(raw.includes('://') ? raw : 'http://' + raw);
  return {
    scheme: (u.protocol || 'http:').replace(/:$/, '') || 'http',
    host: u.hostname,
    port: u.port ? Number(u.port) : null,
    // WHATWG URL does NOT percent-decode username/password; unquote to raw like urlsplit use.
    user: lenientUnquote(u.username || ''),
    pass: lenientUnquote(u.password || ''),
  };
}

function isNoProxy(spec) {
  return !spec || spec === 'none' || spec === '0' || spec === false;
}

/**
 * Return a --proxy-server=... flag for the capium binary, or null for no proxy.
 *
 * Accepted forms:
 *   null / "" / "none" / "0" / false     ->  no proxy
 *   "http://user:pass@host:port"         ->  HTTP/HTTPS proxy with credentials
 *   "socks5://user:pass@host:port"       ->  SOCKS5 with credentials
 *   "socks5://host:port"                 ->  SOCKS5, no auth
 *   {server: "scheme://host:port",       ->  object spec; username/password are
 *    username: "...", password: "..."}       optional -- no-auth if omitted
 */
function buildProxyArg(spec) {
  if (isNoProxy(spec)) return null;

  if (spec && typeof spec === 'object') {
    const { scheme, host, port, user, pass } = specParts(spec);
    if (user) return '--proxy-server=' + proxyUrl(scheme, user, pass, host, port);
    return `--proxy-server=${spec.server}`;
  }

  const { scheme, host, port, user, pass } = specParts(spec);
  if (user) return '--proxy-server=' + proxyUrl(scheme, user, pass, host, port);
  const portStr = port ? `:${port}` : '';
  return `--proxy-server=${scheme}://${host}${portStr}`;
}

// ---- proxy channel selection --------------------------------------------------------------
// Everything now goes through the native inline --proxy-server flag. The capium binary
// authenticates from the inline user:pass@ itself:
//   * SOCKS5  -> RFC 1929 username/password in the handshake (socks_connect_job.cc)
//   * HTTP/S  -> PREEMPTIVE Proxy-Authorization on the FIRST CONNECT
//                (http_proxy_client_socket.cc; capium-preemptive-proxy-auth.patch)
// Preemptive auth means the proxy never has to answer 407, which closes the reactive-auth
// retry loop (net::ERR_TOO_MANY_RETRIES) that inline credentials -- especially country-
// targeted / special-char usernames like "groups-X,country-Y,session-Z" -- used to trigger.
//
// The legacy driver proxy option (CDP auth, answers the 407 over CDP) remains only as an
// escape hatch for a binary WITHOUT the preemptive patch -- opt in with CAPIUM_INLINE_PROXY_AUTH=0.

/**
 * Whether the capium binary authenticates from inline --proxy-server credentials.
 *
 * Default true: the capium binary decodes the inline user:pass@ itself (SOCKS5 RFC 1929 +
 * preemptive HTTP Proxy-Authorization), so ALL proxies use the native --proxy-server flag.
 * Set CAPIUM_INLINE_PROXY_AUTH=0 to force the legacy CDP-auth path for credentialed
 * HTTP/HTTPS (only needed on a binary that lacks the preemptive-proxy-auth patch).
 */
function binarySupportsInlineProxyAuth() {
  const v = process.env.CAPIUM_INLINE_PROXY_AUTH;
  if (v !== undefined && v !== null) {
    return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
  }
  return true;
}

function specIsSocks(spec) {
  return specParts(spec).scheme.toLowerCase().startsWith('socks');
}

/**
 * Optional proxy-bypass list from an object spec (the Playwright 'bypass' key).
 *
 * Comma-separated hosts/patterns that should connect DIRECT, skipping the proxy
 * (e.g. "localhost,*.internal"). Only object specs carry it; a string proxy URL has
 * nowhere to put it. Inline -> --proxy-bypass-list=<v>, CDP -> the option's own 'bypass'.
 */
function specBypass(spec) {
  if (spec && typeof spec === 'object') return spec.bypass || null;
  return null;
}

/**
 * Normalize a spec into a driver proxy option {server, username?, password?}. Credentials
 * are passed RAW -- the driver handles CDP-auth escaping itself, so nothing is re-encoded.
 */
function toDriverProxy(spec) {
  const { scheme, host, port, user, pass } = specParts(spec);
  let server = `${scheme}://${host}`;
  if (port) server += `:${port}`;
  const d = { server };
  if (user) {
    d.username = lenientUnquote(user);
    d.password = lenientUnquote(pass || '');
  }
  const bypass = specBypass(spec);
  if (bypass) d.bypass = bypass;
  return d;
}

/**
 * Return {launchOptions, args} for launching the capium binary.
 *
 * launchOptions -> merged into the driver's launch options (e.g. {proxy: {...}}); args ->
 * appended to the Chromium arg list. Exactly one carries the proxy for any spec:
 *   * DEFAULT: everything -> args (native inline --proxy-server; binary self-auths)
 *   * escape hatch (CAPIUM_INLINE_PROXY_AUTH=0): credentialed HTTP/HTTPS -> launchOptions
 *     (driver CDP auth), for a binary lacking the preemptive-proxy-auth patch. SOCKS5
 *     can NEVER go this way (Chrome must receive it inline), so SOCKS always stays inline.
 *
 * An object spec's optional "bypass" (comma-separated DIRECT hosts) is carried too:
 * --proxy-bypass-list=<v> on the inline paths, or the option's own "bypass" on CDP.
 */
function resolveProxyConfig(spec, inlineAuth = null) {
  if (isNoProxy(spec)) return { launchOptions: {}, args: [] };
  if (inlineAuth === null || inlineAuth === undefined) {
    inlineAuth = binarySupportsInlineProxyAuth();
  }
  const hasCreds = Boolean(specParts(spec).user);
  if (specIsSocks(spec) || !hasCreds || inlineAuth) {
    const arg = buildProxyArg(spec);
    if (!arg) return { launchOptions: {}, args: [] };
    const args = [arg];
    const bypass = specBypass(spec);
    if (bypass) args.push(`--proxy-bypass-list=${bypass}`);
    return { launchOptions: {}, args };
  }
  return { launchOptions: { proxy: toDriverProxy(spec) }, args: [] };
}

module.exports = {
  buildProxyArg,
  resolveProxyConfig,
  binarySupportsInlineProxyAuth,
  toDriverProxy,
  _encodeCred: encodeCred,
  _lenientUnquote: lenientUnquote,
  _specParts: specParts,
};
