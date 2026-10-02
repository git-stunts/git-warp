#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
project="git-warp-watch-$$"
compose=(docker compose --project-name "$project" --file "$ROOT/docker/docker-compose.watch.yml")
scratch=$(mktemp -d)
watch_pid=''
test_pid=''
monitor_pid=''
cleanup() {
  status=$?
  trap - EXIT
  trap '' INT TERM
  for child in "$monitor_pid" "$watch_pid" "$test_pid"; do
    if [[ -n "$child" ]]; then
      kill "$child" 2>/dev/null || true
      wait "$child" 2>/dev/null || true
    fi
  done
  "${compose[@]}" down --timeout 10 || {
    echo 'Failed to clean up Docker watch service' >&2
    if [[ "$status" == 0 ]]; then status=1; fi
  }
  rm -rf "$scratch"
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"${compose[@]}" up --build --detach test-watch
# Compose Watch copies edits into the service; no checkout or Git directory is mounted.
"${compose[@]}" watch --no-up test-watch &
watch_pid=$!
"${compose[@]}" exec --no-TTY test-watch bash scripts/run-in-docker.sh vitest watch "$@" <&0 &
test_pid=$!
(
  while kill -0 "$watch_pid" 2>/dev/null && kill -0 "$test_pid" 2>/dev/null; do sleep 1; done
  if ! kill -0 "$watch_pid" 2>/dev/null; then
    echo 'Docker source synchronization stopped' >&2
    touch "$scratch/watch-failed"
    kill "$test_pid" 2>/dev/null || true
  fi
) &
monitor_pid=$!
status=0
wait "$test_pid" || status=$?
if [[ -f "$scratch/watch-failed" ]]; then exit 1; fi
exit "$status"
