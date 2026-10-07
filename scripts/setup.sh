#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "======================================================="
echo "   Unified-LLSD Developer Onboarding & Environment Setup"
echo "======================================================="

# Ensure pre-commit is installed
if ! command -v pre-commit >/dev/null 2>&1; then
    echo "[1/2] Installing pre-commit via pip..."
    pip install pre-commit
else
    echo "[1/2] pre-commit is already installed."
fi

# Enable pre-commit Git hooks
echo "[2/2] Installing Git pre-commit hooks..."
if git config --get core.hooksPath >/dev/null 2>&1; then
    git config --global --unset-all core.hooksPath 2>/dev/null || true
    git config --unset-all core.hooksPath 2>/dev/null || true
fi
pre-commit install -f

echo ""
echo "✓ Developer environment configured successfully!"
echo "  Pre-commit hooks are now enabled for local git commits."
echo "======================================================="
