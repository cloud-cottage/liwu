#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
ENV_ID="${CLOUDBASE_ENV_ID:-liwu-d8gek6jjdab1d087c}"

cd "$ROOT_DIR"

echo "Deploying CloudBase function: fortuneDailySettlement"
echo "Environment: $ENV_ID"

cloudbase functions:deploy fortuneDailySettlement -e "$ENV_ID"

echo "Done."
