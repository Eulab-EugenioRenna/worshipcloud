#!/bin/sh

set -eu

# Prevent a stale build from making the container appear ready after a failed restart.
rm -f /workspace/dist/apps/web/browser/index.html

exec sh /workspace/scripts/docker-nx.sh \
  run web:build:development \
  --watch \
  --poll=1000 \
  --outputStyle=static
