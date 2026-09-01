"""Make the capiumbrowser package importable when the suite is run in place (no install)."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Absolute path to the repo root (…/capium), so tests that read the C++ source tree
# (version-table consistency) can find src/ whether or not the package is installed.
REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
