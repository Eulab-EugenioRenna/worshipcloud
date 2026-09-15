#!/bin/sh

set -eu

nx_runtime_dir="$(mktemp -d /tmp/worship-nx.XXXXXX)"
export NX_CACHE_DIRECTORY="$nx_runtime_dir/cache"
export NX_WORKSPACE_DATA_DIRECTORY="$nx_runtime_dir/workspace-data"

exec ./node_modules/.bin/nx "$@"
