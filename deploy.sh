#!/usr/bin/env bash
# Server-side deploy script. Run on home server after pushing to GitHub.
# Typical invocation from Claude scheduled task:
#   ssh kondo-home-server "/srv/news/news-for-jobhunting-engineer/deploy.sh"
set -euo pipefail

cd "$(dirname "$0")"

echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') pulling latest..."
git fetch --prune origin
git reset --hard origin/main

echo "[deploy] building and starting container..."
docker compose up -d --build

echo "[deploy] pruning dangling images..."
docker image prune -f >/dev/null 2>&1 || true

echo "[deploy] done. Container status:"
docker compose ps
