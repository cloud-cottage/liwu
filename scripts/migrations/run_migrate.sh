#!/usr/bin/env bash
# Wrapper: sets API keys and runs migration.
# Usage: bash scripts/migrations/run_migrate.sh [--write] [flags...]
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT_DIR"
exec node scripts/migrations/20260805_migrate_to_new_env.mjs "$@"
