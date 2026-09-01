#!/bin/sh
# Dual-mode entrypoint for the Capium Lambda image.
#
#   1. Always start Xvfb on :99 so headed Chromium works no matter how the
#      container is invoked.
#   2. Detect whether the CMD looks like a Lambda handler (a single
#      `module.func`-shaped argument). If yes, route through the Lambda runtime
#      client (the bundled aws-lambda-rie locally, or the real Lambda Runtime
#      API when AWS_LAMBDA_RUNTIME_API is set in production).
#   3. Otherwise exec the CMD directly (so `python`, `bash`, etc. still work).
set -e

mkdir -p /tmp/.X11-unix
chmod 1777 /tmp/.X11-unix 2>/dev/null || true

# Clean any stale Xvfb state. If a previous Xvfb died and left its lock file
# behind (seen in cold-start storms), a new Xvfb refuses to start with
# "Server is already active for display 99". Removing both files fixes it.
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp >/tmp/Xvfb.log 2>&1 &

# Wait for the X11 socket to appear. The socket file appears at bind(), but
# listen()/accept() come slightly later -- under cold-start CPU contention the
# gap matters, so poll then add a small buffer.
i=0
while [ ! -e /tmp/.X11-unix/X99 ] && [ "$i" -lt 200 ]; do
    i=$((i + 1))
    sleep 0.05
done
sleep 0.2

export DISPLAY=:99

# Lambda-handler shape: exactly one arg, dotted identifier. `python`, `bash`,
# `node` all fail this test and pass through to a plain exec.
if [ $# -eq 1 ] && \
   echo "$1" | grep -qE '^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)+$'; then
    if [ -z "${AWS_LAMBDA_RUNTIME_API}" ]; then
        exec /usr/local/bin/aws-lambda-rie python -m awslambdaric "$@"
    else
        exec python -m awslambdaric "$@"
    fi
fi

exec "$@"
