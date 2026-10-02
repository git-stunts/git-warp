#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
project="git-warp-watch-$$"
compose=(docker compose --project-name "$project" --file "$ROOT/docker/docker-compose.watch.yml")
scratch=$(mktemp -d)
watch_pid=''
test_pid=''
monitor_pid=''
container=''
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
  if [[ -n "$container" ]]; then
    if "${compose[@]}" stop --timeout 10 test-watch && \
      docker cp "$container:/app/test" "$scratch/candidate" && \
      bash "$ROOT/scripts/ExportDockerWatchSnapshots.sh" apply "$ROOT" "$scratch" "$project"; then
      :
    else
      echo 'Failed to export Docker watch snapshots' >&2
      if [[ "$status" == 0 ]]; then status=1; fi
    fi
  fi
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

bash "$ROOT/scripts/ExportDockerWatchSnapshots.sh" capture "$ROOT" "$scratch" "$project"
"${compose[@]}" up --build --detach test-watch
container=$("${compose[@]}" ps --all --quiet test-watch)
[[ -n "$container" ]]
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
# Settle the monitor before reading its verdict: both clients can finish
# during its polling interval. A stopped synchronizer cannot certify success.
wait "$monitor_pid" || status=1
monitor_pid=''
if [[ -f "$scratch/watch-failed" ]]; then exit 1; fi
exit "$status"
