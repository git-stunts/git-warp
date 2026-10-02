#!/usr/bin/env bash
# COPY-only proof: a real 2 GiB attachment drains, while eager retention OOMs.
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
image="git-warp-attachment-memory:run-$$"
stream="git-warp-attachment-stream-$$"
framed="git-warp-attachment-framed-$$"
eager="git-warp-attachment-eager-$$"
evidence="$ROOT/.ratchet/attachment-memory/$(git -C "$ROOT" rev-parse --short HEAD)-$$"
mkdir -p "$evidence"
cleanup() {
  status=$?
  trap - EXIT
  for container in "$stream" "$framed" "$eager"; do
    if docker container inspect "$container" >/dev/null 2>&1; then
      if [[ $(docker inspect --format '{{.State.Running}}' "$container") == true ]]; then
        docker stop --time 10 "$container" >/dev/null || status=1
      fi
      docker rm "$container" >/dev/null || status=1
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

docker build --file "$ROOT/docker/Dockerfile.node22-slim" --tag "$image" "$ROOT" > "$evidence/build.log" 2>&1
limits=(--memory=384m --memory-swap=384m --cpus=2)
for mode in stream framed; do
  container=$stream
  [[ "$mode" != framed ]] || container=$framed
  docker run --name "$container" "${limits[@]}" "$image" \
    node --max-old-space-size=96 test/performance/attachment-memory-witness.mjs "$mode" > "$evidence/$mode.log" 2>&1
  docker inspect --format '{{json .State}}' "$container" > "$evidence/$mode-state.json"
  cat "$evidence/$mode.log"
done
set +e
docker run --name "$eager" "${limits[@]}" "$image" \
  node --max-old-space-size=96 test/performance/attachment-memory-witness.mjs eager > "$evidence/eager.log" 2>&1
code=$?
set -e
docker inspect --format '{{json .State}}' "$eager" > "$evidence/eager-state.json"
[[ "$code" == 137 && $(docker inspect --format '{{.State.OOMKilled}}' "$eager") == true ]] || {
  echo "Eager control did not demonstrate Docker OOM (exit $code)" >&2
  exit 1
}
printf '%s\n' 'PASS: plain and framed 2 GiB attachments drained; identical-budget eager control OOM-killed.'
printf 'Evidence: %s\n' "${evidence#"$ROOT/"}"
