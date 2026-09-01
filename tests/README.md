# capiumbrowser SDK unit tests

Fast, **pure-Python** tests for the SDK's decision logic — no browser, no binary, no network.
They run in well under a second and are the layer meant for CI / pre-commit.

```bash
cd capiumbrowser
python -m pytest tests/ -q
```

## What's covered

| File | Guards |
|---|---|
| `test_proxy.py` | `--proxy-server` construction + inline-credential encoding (the comma-username `ERR_TUNNEL_CONNECTION_FAILED` class), idempotent encoding, SOCKS-always-inline, the CDP escape hatch, `--proxy-bypass-list`. |
| `test_geoip_flags.py` | The `geoip` tri-state: `None` = OFF even with a proxy (a proxy alone must not add `--geoip`), `True` = `--geoip`, `False` = `--geoip=false`. Sync + async paths. |
| `test_config_args.py` | Default stealth flags: storage-quota formula, Windows-only font-metrics, `--fingerprint-noise=false`, screen==window coherence, seed-less launch. |
| `test_download_contract.py` | Host → distro tag (`_norm_os`/`_norm_arch`), unsupported platforms raise, and the versioned artifact URL shape. |
| `test_channels_manifest.py` | `channels.json` parses, has all four tags, well-formed versions, and the download tag map / `binary_version_for` / `is_published` agree with it. |
| `test_version_tables_consistent.py` | Parses the C++ tree and asserts the **four** version tables agree on the current major's per-platform build (`fingerprint_data.h` ⇄ `kCapiumChromeBuilds` ⇄ `kStable` ⇄ the fallback pool). Auto-enforces `docs/VERSION-BUMP.md`; skips on an SDK-only checkout. |

## The bigger picture (test layers)

- **This dir** — SDK logic (flags, tags, manifests, table sync). Fast, host-independent.
- **`../../tests/patches/`** — per-OS regression for the in-binary fingerprint patches
  (font-crash, version coherence, seed-independence). Run on each platform's binary:
  `CAPIUM_BIN=<bin> python3 ../../tests/patches/run_tests.py`.
- **`../../tests/fp152/`** — the 13-check stealth smoke (UA/platform/WebGL/canvas/bot/webgpu +
  150/151/152 version-coherence) against a built binary on a GPU host.

A version bump should keep all three green; the seed-parity leak passed a major-only check but
would have been caught by `test_version_seed_independence.py` + `test_version_tables_consistent.py`.
