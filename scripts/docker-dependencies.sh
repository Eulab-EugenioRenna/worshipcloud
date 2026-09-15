#!/bin/sh

set -eu

lock_hash="$(sha256sum package-lock.json | cut -d ' ' -f 1)"
installed_hash="$(cat node_modules/.worship-lock-hash 2>/dev/null || true)"

if [ "$lock_hash" = "$installed_hash" ]; then
  npm run db:generate
  exit 0
fi

npm ci --legacy-peer-deps
printf '%s' "$lock_hash" > node_modules/.worship-lock-hash
