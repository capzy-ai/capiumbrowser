# Capium on AWS Lambda

Run one-off stealth-browser scrapes as a container-image Lambda. The function
launches Capium **headed** under Xvfb, navigates, waits for the page to settle,
and returns the HTML (plus an optional screenshot).

This directory is self-contained — `Dockerfile`, `lambda-entrypoint.sh`, and
`lambda_handler.py`. Build from inside it.

---

## 1. Prerequisites

- Docker with BuildKit (`DOCKER_BUILDKIT=1`) and `buildx`.
- A Capium license key (`cap_…`). The binary is **license-gated at both download
  and launch**, so the key is needed at build time (to fetch the binary) *and* at
  runtime (the binary self-licenses on every cold start).
- An ECR repository and a Lambda execution role (for deployment).

Arm64 is recommended (cheaper, and the examples target it). Swap `--platform`
and the function architecture to `x86_64` if you prefer.

---

## 2. Build

The key is passed as a **BuildKit secret** so it never lands in an image layer
or `docker history`:

```bash
export CAPIUM_LICENSE_KEY=cap_xxxxxxxxxxxxxxxxxxxx

DOCKER_BUILDKIT=1 docker buildx build --platform linux/arm64 \
  --secret id=capium_license,env=CAPIUM_LICENSE_KEY \
  -t capium-lambda:arm64 --load .
```

---

## 3. Test locally

The image bundles the AWS Lambda Runtime Interface Emulator, so you can hit the
standard local-invoke endpoint. The key is needed at **runtime** too:

```bash
docker run --rm -p 9000:8080 \
  -e CAPIUM_LICENSE_KEY="$CAPIUM_LICENSE_KEY" capium-lambda:arm64

# in another shell:
curl -XPOST http://localhost:9000/2015-03-31/functions/function/invocations \
  -d '{"url":"https://example.com","screenshot":true}'
```

Other entrypoints still work (`docker run --rm -it capium-lambda:arm64 bash`,
`… python`).

---

## 4. Deploy

```bash
# Push to ECR
aws ecr get-login-password --region "$REGION" \
  | docker login --username AWS --password-stdin "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
docker tag capium-lambda:arm64 "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/capium-lambda:arm64"
docker push "$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/capium-lambda:arm64"

# Create the function (container image, arm64)
aws lambda create-function \
  --function-name capium-scrape \
  --package-type Image \
  --code ImageUri="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com/capium-lambda:arm64" \
  --architectures arm64 \
  --role "$EXECUTION_ROLE_ARN" \
  --timeout 60 --memory-size 2048 \
  --environment "Variables={CAPIUM_LICENSE_KEY=$CAPIUM_LICENSE_KEY}"
```

Tuning notes:

- **Memory ≥ 2048 MB.** Chromium is memory-hungry; more memory also means more
  vCPU on Lambda, which shortens cold starts.
- **Timeout ≥ 30 s.** Cold start + launch + navigation + settle adds up.
- **Ephemeral storage** can stay at the 512 MB default; the handler writes only
  small scratch under `/tmp`.
- Store the license key in **Secrets Manager** and inject it rather than putting
  it in plaintext function env for anything beyond a quick test.

---

## 5. Event schema

Only `url` is required. Full reference is in the `lambda_handler.py` module
docstring; the common fields:

```json
{
  "url": "https://example.com",
  "seed": 54321,
  "platform": "windows",
  "proxy": "http://user:pass@host:port",
  "geoip": true,
  "screenshot": true,
  "full_page_screenshot": false,
  "wait_until": "domcontentloaded",
  "smart_wait": true,
  "retries": 1
}
```

Returns `{"title", "url", "html", "screenshot_b64"?}`.

---

## 6. Why these settings

- **Headed under Xvfb** — a GPU-less headless Chromium can surface `virtual_machine`
  / `anti_detect` flags; headed on a virtual framebuffer reads cleaner. The
  entrypoint starts Xvfb on `:99` and exports `DISPLAY` before the handler runs.
- **`--disable-dev-shm-usage`** — Lambda's `/dev/shm` is ~64 MB; without this
  Chromium crashes mid-render.
- **`--no-zygote`** — Lambda's restricted process model can't fork from
  Chromium's zygote, so renderer children fail to spawn otherwise.
- **`HOME=/tmp`** — Lambda's runtime filesystem is read-only except `/tmp`;
  Chromium needs a writable scratch/profile dir.
- **Launch retries** — cold-start storms occasionally race Xvfb readiness; the
  handler retries the fast-failing launch a couple of times, and the entrypoint
  cleans stale X locks so a fresh Xvfb starts every time.

> A GPU-less box gives coherent JS-layer spoofing but hardware-bound WebGL/canvas
> checks can still differ from real hardware. For the strictest targets, run the
> persona on a matching-OS, GPU-backed host and proxy through it. See
> <https://docs.capiumbrowser.com>.
