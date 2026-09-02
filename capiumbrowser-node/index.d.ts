/**
 * Type declarations for capiumbrowser.
 *
 * Driver return types are intentionally structural (`any`-compatible) so the package works
 * with playwright-core OR puppeteer-core without depending on either's types. Cast the
 * results to your driver's types at the call site if you want full IntelliSense:
 *
 *     import type { Browser } from 'playwright-core';
 *     const browser = (await launch({ seed: 42 })) as unknown as Browser;
 */

export type Platform = 'windows' | 'macos' | 'linux';

export interface ProxySpec {
  /** "scheme://host:port" (http, https, socks5). */
  server: string;
  username?: string;
  password?: string;
  /** Comma-separated hosts/patterns that connect DIRECT, skipping the proxy. */
  bypass?: string;
}

export interface LaunchOptions {
  /** Identity seed (a stable, coherent device per seed). Random if omitted. */
  seed?: number | null;
  /** The spoofed OS persona. Default "windows". */
  platform?: Platform;
  /** Default false (a windowed browser is the coherent persona default). */
  headless?: boolean;
  /** "http://user:pass@host:port" | "socks5://host:port" | ProxySpec. */
  proxy?: string | ProxySpec | null;
  /**
   * Geo coherence, resolved inside the binary. null/undefined (default) = OFF: no lookup
   * runs, even with a proxy. true = pin timezone/geo/WebRTC/language to the egress.
   * false = explicit opt-out.
   */
  geoip?: boolean | null;
  /** Extra Chromium args appended after the stealth flags. */
  args?: string[] | null;
  /** false drops the default fingerprint flags. Default true. */
  stealthArgs?: boolean;
  /** IANA timezone override (in-binary spoof), e.g. "Europe/Berlin". */
  timezone?: string | null;
  /** BCP-47 locale override, e.g. "de-DE". */
  locale?: string | null;
  /** Unpacked extension dir(s) to load. */
  extensionPaths?: string | string[] | null;
  /** Explicit path to the capium launch target (skips discovery + download). */
  binary?: string | null;
  /** License key (else CAPIUM_LICENSE_KEY / ~/.capium/license). Never lands on argv. */
  licenseKey?: string | null;
  licenseServer?: string | null;
  /** Route the binary's license traffic through the configured proxy. */
  licenseThroughProxy?: boolean;
  /** Fail fast (offline) with CapiumConfigError when no key is set. Default true. */
  licensePreflight?: boolean;
  /** Any remaining options are forwarded to the driver's launch(). */
  [driverOption: string]: unknown;
}

export interface LaunchContextOptions extends LaunchOptions {
  /** Navigate the first page here (domcontentloaded). */
  url?: string | null;
  /** Attach page.humanMove/humanClick/humanType/humanScroll helpers. */
  humanize?: boolean;
  humanPreset?: 'default' | 'careful';
}

export class CapiumError extends Error {}
export class CapiumLicenseError extends CapiumError {}
export class CapiumConfigError extends CapiumLicenseError {}
export class CapiumSeatLimitError extends CapiumLicenseError {}
export class CapiumExpiredError extends CapiumLicenseError {}
export class CapiumServerDownError extends CapiumLicenseError {}

export const VERSION: string;
export const CAPIUM_BINARY_VERSION: string;
export const CAPIUM_BINARY_VERSIONS: Record<string, string>;

/**
 * Escape hatch (on the capiumbrowser/playwright and capiumbrowser/puppeteer subpaths):
 * the ready-made options object for the driver's own launch(), for framework
 * integrations that must hold the launch themselves.
 */
export function buildLaunchOptions(options?: LaunchOptions): Promise<Record<string, unknown>>;

/** Launch a Capium Browser via the installed driver (Playwright preferred when both are). */
export function launch(options?: LaunchOptions): Promise<any>;
export function launchContext(options?: LaunchContextOptions):
  Promise<{ browser: any; context?: any; page: any }>;
export function launchPersistentContext(userDataDir: string, options?: LaunchOptions):
  Promise<any>;
export function detectDriver(): {
  launch: typeof launch;
  launchContext: typeof launchContext;
  launchPersistentContext: typeof launchPersistentContext;
};

export function status(licenseKey?: string | null, licenseServer?: string | null):
  Promise<{ plan: string | null; sessions_cap: number | null; live_sessions: number | null;
    period_end: string | null; heartbeat_every: number | null }>;

export namespace config {
  function getDefaultStealthArgs(seed?: number | null, platform?: Platform,
    screen?: [number, number] | null): string[];
  function newSeed(): number;
  function findBinary(binary?: string | null): string;
}

export namespace proxy {
  function buildProxyArg(spec: string | ProxySpec | null | false): string | null;
  function resolveProxyConfig(spec: string | ProxySpec | null | false,
    inlineAuth?: boolean | null): { launchOptions: object; args: string[] };
}

export namespace download {
  function downloadTag(system?: string | null, machine?: string | null): string;
  function distroPath(version: string, tag: string): string;
  function ensureBinary(opts?: { version?: string | null; licenseKey?: string | null;
    server?: string | null }): Promise<string>;
  function installedVersion(binPath?: string | null): string | null;
}

export namespace human {
  function humanize<T>(target: T, preset?: 'default' | 'careful'): T;
  function move(page: any, x: number, y: number, preset?: string): Promise<void>;
  function click(page: any, selector: string, preset?: string): Promise<void>;
  function typeText(page: any, selector: string, text: string, preset?: string): Promise<void>;
  function scroll(page: any, dy: number, preset?: string): Promise<void>;
  function dwell(loSec?: number, hiSec?: number): Promise<void>;
}
