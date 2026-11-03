#!/usr/bin/env bash
set -e

# Polyglot SDK Developer Onboarding & Local Pre-Commit Hook Installation Script
# Registers git pre-commit hooks into .git/hooks/pre-commit across developer environments.

echo "================================================================="
echo "   Unified-LLSD Developer Onboarding & Pre-Commit Setup   "
echo "================================================================="

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

cd "$REPO_ROOT"

# Ensure Python 3 is available
if ! command -v python3 >/dev/null 2>&1; then
    echo "Error: Python 3 is required to install pre-commit." >&2
    exit 1
fi

# Ensure pre-commit executable is installed
if ! command -v pre-commit >/dev/null 2>&1; then
    echo "[1/3] Installing pre-commit package..."
    python3 -m pip install pre-commit
else
    echo "[1/3] pre-commit package is already installed."
fi

# Register pre-commit git hooks
echo "[2/3] Registering pre-commit hooks..."
git config --local --unset-all core.hooksPath 2>/dev/null || true
git config --global --unset-all core.hooksPath 2>/dev/null || true
pre-commit install

# Set local core.hooksPath to .git/hooks if needed
echo "[3/3] Activating local git hooks..."
git config --local core.hooksPath .git/hooks

echo ""
echo "✓ Pre-commit hooks installed successfully!"
echo "✓ Pre-commit checks will now run automatically on staged files during 'git commit'."
echo "To manually execute checks across all files run: pre-commit run --all-files"
echo "================================================================="
