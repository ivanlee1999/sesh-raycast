#!/bin/sh
set -eu

extension_dir="$HOME/.config/raycast-x/extensions/sesh"

cleanup() {
  if [ -n "${dev_pid:-}" ] && kill -0 "$dev_pid" 2>/dev/null; then
    kill "$dev_pid" 2>/dev/null || true
    wait "$dev_pid" 2>/dev/null || true
  fi
}

trap cleanup INT TERM EXIT

ray develop --target x &
dev_pid=$!

i=0
while [ "$i" -lt 20 ]; do
  if [ -f "$extension_dir/package.json" ]; then
    break
  fi
  i=$((i + 1))
  sleep 0.5
done

ray build -e dist --target x
mkdir -p "$extension_dir"
: > "$extension_dir/dev.log"

wait "$dev_pid"
