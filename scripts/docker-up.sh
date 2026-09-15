#!/bin/sh

set -eu

# Run this every time so package-lock changes are reflected in the persistent volume.
docker compose run --rm dependencies
docker compose up -d
