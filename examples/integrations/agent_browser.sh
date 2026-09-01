#!/bin/bash
# agent-browser + Capium: an AI browser agent with source-level stealth.
#
# agent-browser is a Node.js CLI for browser automation with session management.
# Capium provides the stealth Chromium binary. agent-browser launches Chrome
# itself via env vars (it can't attach to an existing browser over CDP), so we
# hand it the binary path and the stealth args directly.
#
# Requires: npm install -g agent-browser
#           pip install capiumbrowser        # to auto-download the binary
#           export CAPIUM_LICENSE_KEY=cap_... # the binary is license-gated
set -e

SEED="${CAPIUM_SEED:-54321}"
PLATFORM="${CAPIUM_PLATFORM:-windows}"

# Capium binary path (auto-downloads the license-gated build if needed).
BINARY_PATH=$(python3 -c "from capiumbrowser.download import ensure_binary; print(ensure_binary())")

# Stealth args for this persona, comma-separated for agent-browser.
STEALTH_ARGS=$(python3 -c "from capiumbrowser.config import get_default_stealth_args; \
print(','.join(get_default_stealth_args(seed=$SEED, platform='$PLATFORM')))")

# Point agent-browser at Capium.
export AGENT_BROWSER_EXECUTABLE_PATH="$BINARY_PATH"
export AGENT_BROWSER_ARGS="$STEALTH_ARGS"

# Open a page, read the title, and check the stealth surface.
agent-browser --session capium-test open "https://example.com"
agent-browser --session capium-test eval "document.title"
agent-browser --session capium-test eval \
  "JSON.stringify({webdriver: navigator.webdriver, plugins: navigator.plugins.length, platform: navigator.platform})"
