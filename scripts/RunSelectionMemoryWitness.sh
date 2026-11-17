#!/usr/bin/env bash
# COPY-only fixed-memory witness for the liveness selection plane (#816 S1).
# Folds a small and a four-times-larger generated history into a real Git record
# trie, each in a container capped at 384 MiB with a 128 MiB old space, and
# reports the peak staged records and the peak RSS of both runs.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
image="git-warp-selection-memory:run-$$"
evidence="$ROOT/.ratchet/selection-memory/$(git -C "$ROOT" rev-parse --short HEAD)-$$"
containers=()
mkdir -p "$evidence"
cleanup() {
  status=$?
  trap - EXIT
  for container in ${containers[@]+"${containers[@]}"}; do
    if docker container inspect "$container" >/dev/null 2>&1; then
      docker rm --force "$container" >/dev/null || status=1
    fi
  done
  if docker image inspect "$image" >/dev/null 2>&1; then
    docker image rm "$image" >/dev/null || status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

docker build --file "$ROOT/docker/Dockerfile.node22-slim" --tag "$image" "$ROOT" >"$evidence/build.log" 2>&1
limits=(--memory=384m --memory-swap=384m --cpus=2)
for size in 70000 280000; do
  container="git-warp-selection-memory-$size-$$"
  containers+=("$container")
  docker run --name "$container" "${limits[@]}" "$image" \
    node --max-old-space-size=128 test/performance/selection-memory-witness.ts "$size" 2 >"$evidence/$size.log" 2>&1
  docker inspect --format '{{json .State}}' "$container" >"$evidence/$size-state.json"
  grep '^SELECTION_WITNESS ' "$evidence/$size.log"
done
printf 'Evidence: %s\n' "${evidence#"$ROOT/"}"
