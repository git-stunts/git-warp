#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
entries=(none)
source_history=0
update_ratchet=0
snapshot=0
while [[ "$#" -gt 0 ]]; do
  case "$1" in
    --export-directory) entries+=("directory:$2"); shift 2;;
    --export-file) entries+=("file:$2"); shift 2;;
    --coverage-ratchet) update_ratchet=1; entries+=(directory:coverage); shift;;
    --snapshot) snapshot=1; source_history=1; shift;;
    --) shift; break;;
    *) break;;
  esac
done
[[ "$#" -gt 0 ]]
if [[ "$snapshot" == 1 ]]; then
  output_root=.ratchet
  for arg in "$@"; do
    case "$arg" in --output-root=*) output_root=${arg#--output-root=};; esac
  done
  entries+=("directory:$output_root")
fi
if [[ -f /.dockerenv ]]; then
  node "$ROOT/scripts/RequireDockerTests.ts"
  export PATH="$ROOT/node_modules/.bin:$PATH"
  exec "$@"
fi

# The orchestrator owns the copied container until outputs have been exported.
exec bash "$ROOT/scripts/RunDockerTestContainer.sh" "$source_history" "$update_ratchet" \
  "${#entries[@]}" "${entries[@]}" -- "$@"
