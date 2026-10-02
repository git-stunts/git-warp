#!/usr/bin/env bash
set -euo pipefail
ROOT=$(cd "$(dirname "$0")/.." && pwd)
mode=${1:?usage: RunDockerPerformance.sh <measure|streaming|migrated-read|gate|compare> [arguments]}
shift
if [[ "$mode" == compare && ! -f /.dockerenv ]]; then
  exec bash "$ROOT/scripts/RunDockerPerformanceComparison.sh" "$@"
fi
exports=(--source-history)
case "$mode" in
  measure) output=benchmarks/v19/results/latest.json; program=dist/scripts/performance/RunPerformance.js;;
  streaming) output=benchmarks/v19/results/streaming-latest.json; program=dist/scripts/performance/RunStreamingPerformance.js;;
  migrated-read) output=.performance/migrated-read/report.json; program=dist/scripts/v18-to-v19/performance/RunMigratedReadPerformance.js;;
  gate) output=''; program=dist/scripts/performance/GatePerformance.js;;
  compare) output=''; program=dist/scripts/performance/RunPerformanceComparison.js;;
  *) echo 'Unknown performance mode' >&2; exit 2;;
esac
args=()
while [[ "$#" -gt 0 ]]; do
  [[ "$#" -ge 2 && -n "$2" ]] || { echo 'Performance arguments require option/value pairs' >&2; exit 2; }
  option=$1 value=$2
  if [[ "$option" == --output || "$option" == --summary ]]; then
    case "$value" in "$ROOT/"*) value=${value#"$ROOT/"};; esac
    while [[ "$value" == ./* ]]; do value=${value#./}; done
    output=$value
  fi
  if [[ "$mode" == gate ]]; then
    case "$option" in
      --head|--base|--comparison|--policy)
        case "$value" in "$ROOT/"*) value=${value#"$ROOT/"};; esac
        while [[ "$value" == ./* ]]; do value=${value#./}; done
        case "$value" in .ratchet/*) exports+=(--import-file "$value");; esac
        ;;
    esac
  fi
  args+=("$option" "$value")
  shift 2
done
if [[ -n "$output" ]]; then
  exports+=(--export-file "$output")
  if [[ "$mode" == migrated-read ]]; then exports+=(--export-file "$(dirname "$output")/summary.md"); fi
fi
# Forward measurement settings, never credentials or host dependency paths.
settings=(env)
for name in RUNNER_ENVIRONMENT GIT_WARP_PERF_BASE_NODES GIT_WARP_PERF_BASE_PATCHES \
  GIT_WARP_PERF_INCREMENTAL_NODES GIT_WARP_PERF_INCREMENTAL_PATCHES \
  GIT_WARP_PERF_PROPERTY_BYTES GIT_WARP_PERF_RUNS GIT_WARP_PERF_WARMUPS \
  GIT_WARP_MIGRATED_READ_RUNS GIT_WARP_MIGRATED_READ_WARMUPS; do
  if [[ -n "${!name-}" ]]; then settings+=("$name=${!name}"); fi
done
if [[ "$mode" == migrated-read ]]; then
  command='npm ci --prefix fixtures/v18/retained-substrate-medium --ignore-scripts && npm run build:maintainer --silent && node "$@"'
else
  command='npm run build:maintainer --silent && node "$@"'
fi
# Older macOS Bash cannot expand an empty array under nounset.
if [[ "${#args[@]}" == 0 ]]; then
  exec bash "$ROOT/scripts/run-in-docker.sh" "${exports[@]}" -- "${settings[@]}" sh -c "$command" -- "$program"
fi
exec bash "$ROOT/scripts/run-in-docker.sh" "${exports[@]}" -- "${settings[@]}" sh -c "$command" -- "$program" "${args[@]}"
