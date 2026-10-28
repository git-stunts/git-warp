#!/usr/bin/env bash
# COPY-only cone showcase: typecheck and run the annotations example, then run the
# cost witness once per scale, each in its own bounded container.
#
# Usage: bash benchmarks/cone-showcase/RunConeShowcaseWitness.sh [--label NAME] [--no-example] [THREADS...]
#   THREADS defaults to 200 2000 20000. Results land in
#   .ratchet/cone-showcase/<label>-<pid>/ (cone-showcase-<N>.json, summary.md, logs).
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
label=''
example=1
scales=()
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --label) [[ "$#" -ge 2 && -n "$2" ]] || { echo 'Usage: --label NAME' >&2; exit 2; }; label=$2; shift 2;;
    --no-example) example=0; shift;;
    *) [[ "$1" =~ ^[0-9]+$ ]] || { echo "Unknown argument: $1" >&2; exit 2; }; scales+=("$1"); shift;;
  esac
done
[[ "${#scales[@]}" -gt 0 ]] || scales=(200 2000 20000)
[[ -n "$label" ]] || label=$(git -C "$ROOT" rev-parse --short HEAD)
[[ "$label" =~ ^[A-Za-z0-9._-]+$ ]] || { echo 'Label must be [A-Za-z0-9._-]+' >&2; exit 2; }
image="git-warp-cone-showcase:run-$$"
prefix="git-warp-cone-showcase-$$"
evidence="$ROOT/.ratchet/cone-showcase/$label-$$"
mkdir -p "$evidence"
containers=()
cleanup() {
  status=$?
  trap - EXIT
  for container in "${containers[@]+"${containers[@]}"}"; do
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

# Limits: CPU, memory and process count are enforced by Docker; generated data is
# bounded by the witness itself (--budget-bytes, checked after every 25 patches
# and every phase) and dies with each container; logs rotate at 16 MiB.
limits=(--memory=6g --memory-swap=6g --cpus=4 --pids-limit=4096 --log-opt max-size=16m --log-opt max-file=2)
budget=$((4 * 1024 * 1024 * 1024))

docker build --file "$ROOT/docker/Dockerfile.node22-slim" --tag "$image" "$ROOT" > "$evidence/build.log" 2>&1
git -C "$ROOT" rev-parse HEAD > "$evidence/source-commit.txt"

if [[ "$example" == 1 ]]; then
  container="$prefix-example"
  containers+=("$container")
  set +e
  docker run --name "$container" "${limits[@]}" "$image" timeout --kill-after=30 600 sh -c \
    'node scripts/RequireDockerTests.ts && node_modules/.bin/tsc -p examples/annotations/tsconfig.json && exec node examples/annotations/run.ts' \
    > "$evidence/example.log" 2>&1
  echo "$?" > "$evidence/example.exit"
  set -e
  echo "annotations example exit $(cat "$evidence/example.exit") (log: example.log)"
fi

for threads in "${scales[@]}"; do
  seconds=600
  if [[ "$threads" -gt 200 ]]; then seconds=1200; fi
  if [[ "$threads" -gt 2000 ]]; then seconds=1800; fi
  container="$prefix-$threads"
  containers+=("$container")
  set +e
  docker run --name "$container" "${limits[@]}" "$image" timeout --kill-after=30 "$seconds" sh -c \
    'node scripts/RequireDockerTests.ts && mkdir -p /tmp/cone-showcase && exec node benchmarks/cone-showcase/ConeShowcaseWitness.ts "$@"' -- \
    --threads "$threads" --out "/tmp/cone-showcase/cone-showcase-$threads.json" \
    --deadline-ms $(((seconds - 90) * 1000)) --budget-bytes "$budget" \
    > "$evidence/witness-$threads.log" 2>&1
  code=$?
  set -e
  echo "$code" > "$evidence/witness-$threads.exit"
  docker cp "$container:/tmp/cone-showcase/cone-showcase-$threads.json" "$evidence/" >/dev/null 2>&1 \
    || echo "{\"threads\": $threads, \"status\": \"no result (exit $code)\", \"elapsedMs\": null, \"maxRssMiB\": null}" > "$evidence/cone-showcase-$threads.json"
  docker rm --force "$container" >/dev/null
  echo "witness $threads threads: exit $code"
done

node "$ROOT/benchmarks/cone-showcase/WitnessReport.ts" "$evidence" "$label" > /dev/null
printf 'Evidence: %s\n' "${evidence#"$ROOT/"}"
cat "$evidence/summary.md"
