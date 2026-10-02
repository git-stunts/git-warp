#!/usr/bin/env bash
# Copy only release metadata and consumer tools into an owned, mount-free image.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
WORK="${1:?consumer evidence directory required}"
PACKAGE="${2:?package required}"
VERSION="${3:?version required}"
# shellcheck source=scripts/release-closure/budget.sh
source "$ROOT/release-closure/budget.sh"
start_budget "${4:?remaining budget required}" 180
CONTEXT=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-consumer-image.XXXXXX")
OWNER="git-warp-release-consumer-$$-$(basename "$CONTEXT" | tr '[:upper:]' '[:lower:]')"
IMAGE="$OWNER:copy"
CONTAINER_CREATED=0
STAGE=prepare
EVIDENCE_COMPLETE=0
CLIENT=""

# Waiting on an owned client through Bash's wait builtin lets signal traps run
# immediately; a foreground client would defer cleanup until its own deadline.
run_command() {
  local limit="$1" code=0
  shift
  timeout --kill-after=1s "${limit}s" "$@" &
  CLIENT=$!
  wait "$CLIENT" || code=$?
  CLIENT=""
  return "$code"
}

bounded_docker() {
  local limit
  limit=$(budget_remaining) || return $?
  [ "$limit" -le "$CLOSURE_COMMAND_LIMIT" ] || limit="$CLOSURE_COMMAND_LIMIT"
  run_command "$limit" docker "$@"
}

# All cleanup operations share one five-second grace, rather than restarting
# the verification budget or giving every Docker call its own grace period.
cleanup_command() {
  local remaining=$((CLEANUP_DEADLINE - SECONDS))
  [ "$remaining" -gt 0 ] || return 124
  timeout --kill-after=1s "${remaining}s" "$@"
}

finish() {
  local code=$? evidence=failed cleanup=complete log_count=0
  trap - EXIT
  trap '' INT TERM
  CLEANUP_DEADLINE=$((SECONDS + 5))
  if [ -n "$CLIENT" ]; then
    kill -TERM "$CLIENT" 2>/dev/null || true
    wait "$CLIENT" 2>/dev/null || true
  fi
  if [ "$CONTAINER_CREATED" -eq 1 ]; then
    cleanup_command docker stop --time 1 "$OWNER" >/dev/null 2>&1 || cleanup=failed
    cleanup_command docker logs "$OWNER" > "$WORK/container.log" 2>&1 || cleanup=failed
    if cleanup_command docker cp "$OWNER:/evidence/consumer.json" "$CONTEXT/consumer.json" \
      > "$WORK/export.log" 2>&1 && [ -f "$CONTEXT/consumer.json" ] && [ ! -L "$CONTEXT/consumer.json" ] &&
      jq -e 'type=="object" and (.status=="verified" or .status=="failed")' "$CONTEXT/consumer.json" >/dev/null; then
      if cp "$CONTEXT/consumer.json" "$WORK/consumer.json"; then evidence=complete; fi
    fi
    for log in install signatures cli; do
      cleanup_command docker cp "$OWNER:/evidence/$log.log" "$CONTEXT/$log.log" \
        >> "$WORK/export.log" 2>&1 || continue
      if [ -f "$CONTEXT/$log.log" ] && [ ! -L "$CONTEXT/$log.log" ]; then
        if cp "$CONTEXT/$log.log" "$WORK/$log.log"; then
          log_count=$((log_count + 1))
        fi
      fi
    done
    if [ "$code" -eq 0 ] && [ "$log_count" -ne 3 ]; then evidence=failed; fi
    cleanup_command docker rm "$OWNER" >> "$WORK/export.log" 2>&1 || cleanup=failed
  fi
  cleanup_command docker image rm "$IMAGE" >> "$WORK/export.log" 2>&1 || cleanup=failed
  rm -rf "$CONTEXT" || cleanup=failed
  if [ "$code" -eq 0 ] && [ "$evidence" = complete ] && [ "$cleanup" = complete ] &&
    jq -e '.status=="verified" and .rootImport=="passed" and
      .privateStorageFirewall=="passed" and .cli=="passed" and
      .registrySignatures=="verified" and (.dependencies|type=="array") and
      any(.dependencies[];.package=="@git-stunts/git-cas") and
      any(.dependencies[];.package=="@git-stunts/plumbing")' "$WORK/consumer.json" >/dev/null; then
    EVIDENCE_COMPLETE=1
  else
    [ "$code" -ne 0 ] || code=1
  fi
  jq --arg stage "$STAGE" --arg evidence "$evidence" --arg cleanup "$cleanup" \
    --argjson complete "$EVIDENCE_COMPLETE" '
    if $complete==1 then . else
      {status:"failed",stage:(if $evidence=="complete" and .status=="failed" and .stage
        then .stage else $stage end)} end |
    .execution={boundary:"copy-docker",evidence:$evidence,cleanup:$cleanup}
  ' "$WORK/consumer.json" > "$WORK/consumer-final.json"
  mv "$WORK/consumer-final.json" "$WORK/consumer.json"
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
printf '{"status":"failed","stage":"prepare"}\n' > "$WORK/consumer.json"
[[ "$PACKAGE" = @git-stunts/git-warp ]] || exit 2
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$ ]] || exit 2

cp "$ROOT/RequireDockerTests.ts" "$CONTEXT/"
cp "$ROOT/release-closure/consumer.sh" "$ROOT/release-closure/budget.sh" \
  "$ROOT/release-closure/Dockerfile" "$CONTEXT/"
jq -e --arg package "$PACKAGE" --arg version "$VERSION" '
  select(.name==$package and .version==$version and
    (.dist.integrity|type=="string" and startswith("sha512-"))) |
  {name,version,dist:{integrity:.dist.integrity}}
' "$WORK/npm.json" > "$CONTEXT/npm.json"
bounded_docker build --tag "$IMAGE" "$CONTEXT" > "$WORK/image.log" 2>&1
STAGE=create
REMAINING=$(budget_remaining)
CONTAINER_CREATED=1
bounded_docker create --name "$OWNER" --cpus 2 --memory 2g "$IMAGE" \
  "$PACKAGE" "$VERSION" "$REMAINING" > "$WORK/create.log" 2>&1
STAGE=run
REMAINING=$(budget_remaining)
run_command "$REMAINING" docker start --attach "$OWNER" > "$WORK/start.log" 2>&1
STAGE="export"
