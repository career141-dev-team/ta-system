#!/bin/sh
# Starts (or restarts) the chip search service from the code in /opt/chip-search/code.
# On the app's Docker network only: the app reaches it as http://chip-search:3311,
# nothing outside the server can.
set -eu
D=/opt/chip-search
docker rm -f chip-search 2>/dev/null || true
docker run -d --name chip-search --restart unless-stopped --network career141_default \
  --memory 4g -v "$D/data:/data:ro" -v "$D/code:/app:ro" -w /app/services/chip-search \
  -e ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' /opt/ta-prod/.env.production | cut -d= -f2- || true)" \
  -e OPENROUTER_API_KEY="$(grep '^OPENROUTER_API_KEY=' /opt/ta-prod/.env.production | cut -d= -f2- || true)" \
  -e CHIP_CARDS=/data/cards.jsonl \
  node:22-alpine node --experimental-strip-types --no-warnings --import ./reg.mjs server.ts
