#!/usr/bin/env bash
# Sync script wrapper for Git Bash / WSL / Linux
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if command -v pwsh >/dev/null 2>&1; then
    pwsh -NoProfile -ExecutionPolicy Bypass -File "$SCRIPT_DIR/sync.ps1" "$@"
elif command -v powershell.exe >/dev/null 2>&1; then
    WIN_SCRIPT_PATH="$(cygpath -w "$SCRIPT_DIR/sync.ps1" 2>/dev/null || echo "$SCRIPT_DIR/sync.ps1")"
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$WIN_SCRIPT_PATH" "$@"
else
    echo "[LỖI] Cần PowerShell hoặc pwsh để thực thi script đồng bộ này." >&2
    exit 1
fi
