# Capium on AWS Lambda (container image).
#
# Unlike a hosted base image, the Capium binary is license-gated: it's fetched
# from the license service with your key. This Dockerfile installs the SDK, then
# downloads the binary at BUILD time using a BuildKit secret so the key never
# lands in an image layer or `docker history`.
#
# This directory is self-contained -- build from inside it.
#
# ─── Build (arm64; pass the license key as a BuildKit secret) ─────────────────
#   DOCKER_BUILDKIT=1 docker buildx build --platform linux/arm64 \
#     --secret id=capium_license,env=CAPIUM_LICENSE_KEY \
#     -t capium-lambda:arm64 --load .
#
# ─── Local invoke (bundled Lambda Runtime Interface Emulator) ─────────────────
#   docker run --rm -p 9000:8080 \
#     -e CAPIUM_LICENSE_KEY="$CAPIUM_LICENSE_KEY" capium-lambda:arm64
#   curl -XPOST http://localhost:9000/2015-03-31/functions/function/invocations \
#     -d '{"url":"https://example.com"}'
#
# ─── Other entrypoints (CMD overridden) ───────────────────────────────────────
#   docker run --rm -it capium-lambda:arm64 python            # REPL
#   docker run --rm -it capium-lambda:arm64 bash              # shell

FROM public.ecr.aws/lambda/python:3.12

# ─── System libraries the Chromium engine + Xvfb need ─────────────────────────
# The Lambda Python base is AL2023-based; pull the runtime libs Chromium links
# against plus a virtual framebuffer so we can run headed.
RUN dnf install -y \
        xorg-x11-server-Xvfb \
        nss nspr atk at-spi2-atk at-spi2-core cups-libs libdrm \
        libXcomposite libXdamage libXfixes libXrandr libgbm \
        pango cairo alsa-lib libxkbcommon \
        mesa-libgbm mesa-libEGL \
    && dnf clean all

# ─── SDK + the license-gated binary ───────────────────────────────────────────
# CAPIUM_HOME is where the downloaded distro is extracted; point CAPIUM_BINARY at
# the wrapper so the SDK finds it without a search. The key is mounted as a
# secret only for the install RUN -- it is NOT persisted into any layer.
ENV CAPIUM_HOME=/opt/capium
RUN pip install --no-cache-dir capiumbrowser playwright
RUN --mount=type=secret,id=capium_license \
    CAPIUM_LICENSE_KEY="$(cat /run/secrets/capium_license)" \
    python -m capiumbrowser install
# Lambda runs the container as a non-root user that can't read root-owned trees
# by default -- make the binary world-readable + traversable.
RUN chmod -R o+rX /opt/capium
# The SDK discovers the extracted capium-*/ distro under CAPIUM_HOME at launch; no
# CAPIUM_BINARY needed (the exact path is capium-<ver>-<tag>/, not a fixed name).

# ─── Lambda Runtime Interface Client + local emulator ─────────────────────────
RUN pip install --no-cache-dir awslambdaric
ARG TARGETARCH
ADD https://github.com/aws/aws-lambda-runtime-interface-emulator/releases/latest/download/aws-lambda-rie-${TARGETARCH} \
    /usr/local/bin/aws-lambda-rie
RUN chmod +x /usr/local/bin/aws-lambda-rie

# ─── Glue: dual-mode entrypoint + handler ─────────────────────────────────────
COPY lambda-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
COPY lambda_handler.py ${LAMBDA_TASK_ROOT}/lambda_handler.py

# ─── Lambda runtime env ───────────────────────────────────────────────────────
# HOME=/tmp gives Chromium a writable scratch dir (Lambda only allows writes
# under /tmp). The binary tree at /opt/capium is world-readable already.
ENV HOME=/tmp \
    DISPLAY=:99

ENTRYPOINT ["/entrypoint.sh"]
CMD ["lambda_handler.handler"]
