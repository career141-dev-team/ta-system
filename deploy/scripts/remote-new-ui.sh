#!/usr/bin/env bash
# Puts a new-UI release live on the server (24 Nov 2026). Called by the release
# pipeline after it uploads /tmp/new-ui-<sha>.tgz (the static export) and
# /tmp/new-ui-api-<sha>.mjs (the two Apify routes, one bundled file).
#
# Each release is its own folder; "current" is a link Caddy serves, so switching
# is one atomic link change and going back is: ln -sfn <older release> current.
# The last five releases are kept.
set -euo pipefail

SHA="${1:?usage: remote-new-ui.sh <sha>}"
BASE=/opt/new-ui
REL="$BASE/releases/$SHA"

mkdir -p "$REL" "$BASE/api"
tar -xzf "/tmp/new-ui-$SHA.tgz" -C "$REL"
test -f "$REL/today.html" || { echo "release $SHA has no today.html - not switching"; exit 1; }
chmod -R a+rX "$BASE/releases"
ln -sfn "$REL" "$BASE/current"
echo "new UI now serves $SHA"

# The routes container: same image and settings every time, new code file.
install -m 0644 "/tmp/new-ui-api-$SHA.mjs" "$BASE/api/server.mjs"
[ -f "$BASE/.env" ] || { echo "APIFY_TOKEN=" > "$BASE/.env"; chmod 600 "$BASE/.env"; }
docker rm -f new-ui-api >/dev/null 2>&1 || true
docker run -d --name new-ui-api --restart unless-stopped --env-file "$BASE/.env" \
  -p 127.0.0.1:3200:3200 -v "$BASE/api:/app:ro" -w /app node:22-alpine node server.mjs >/dev/null
sleep 2
docker ps --filter name=new-ui-api --format '{{.Names}} {{.Status}}'

rm -f "/tmp/new-ui-$SHA.tgz" "/tmp/new-ui-api-$SHA.mjs"
ls -1dt "$BASE"/releases/* | tail -n +6 | xargs -r rm -rf
echo "$(date -u +%FT%TZ) $SHA" >> "$BASE/history.log"
