#!/bin/sh
# The nightly card refresh (systemd timer chip-search-nightly, 03:30 Colombo,
# after the 02:30 backup). Read-only export -> build.ts -> service reload.
# Never writes to the database.
# "nightly.sh text" writes only the names and CV text file (no cards, no AI) and reloads.
# The Cloudflare R2 keys for the CVs' text are read from $D/r2.env when that file is there
# (R2_ENDPOINT, R2_BUCKET_NAME, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, as on the backend).
set -eu
D=/opt/chip-search
MODE="${1:-}"
R2ENV=""
[ -f "$D/r2.env" ] && R2ENV="--env-file $D/r2.env"
PG=career141-postgres-1
docker exec -i "$PG" sh -c 'psql -U "$POSTGRES_USER" -d convex_self_hosted -q' < "$D/code/services/chip-search/export.sql"
docker cp "$PG:/tmp/chip-cand.jsonl" "$D/data/cand.jsonl"
docker cp "$PG:/tmp/chip-res.jsonl" "$D/data/res.jsonl"
docker exec "$PG" rm -f /tmp/chip-cand.jsonl /tmp/chip-res.jsonl
docker run --rm --cpus 2 -v "$D/data:/data" -v "$D/code:/app" -w /app/services/chip-search \
  -e ANTHROPIC_API_KEY="$(grep '^ANTHROPIC_API_KEY=' /opt/ta-prod/.env.production | cut -d= -f2- || true)" \
  -e OPENROUTER_API_KEY="$(grep '^OPENROUTER_API_KEY=' /opt/ta-prod/.env.production | cut -d= -f2- || true)" \
  $R2ENV node:22-alpine node --experimental-strip-types --no-warnings --import ./reg.mjs build.ts $MODE
rm -f "$D/data/cand.jsonl" "$D/data/res.jsonl"
docker exec chip-search wget -qO- --post-data= http://127.0.0.1:3311/reload
