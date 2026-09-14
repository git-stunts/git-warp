#!/usr/bin/env bash
# Run the pinned local JSR publisher with classified, bounded retries.
set -euo pipefail

ROOT=$(git rev-parse --show-toplevel 2>/dev/null || pwd)
JSR_BIN="${GIT_WARP_JSR_BIN:-$ROOT/node_modules/.bin/jsr}"
ATTEMPTS="${GIT_WARP_JSR_ATTEMPTS:-3}"
DELAY_SECONDS="${GIT_WARP_JSR_DELAY_SECONDS:-15}"
EXPECTED_DENO_VERSION="2.6.7"

case "$ATTEMPTS" in
  "" | 0 | *[!0-9]*)
    echo "run-jsr-publish: GIT_WARP_JSR_ATTEMPTS must be a positive integer" >&2
    exit 2
    ;;
esac
case "$DELAY_SECONDS" in
  "" | *[!0-9]*)
    echo "run-jsr-publish: GIT_WARP_JSR_DELAY_SECONDS must be a non-negative integer" >&2
    exit 2
    ;;
esac
if [ ! -x "$JSR_BIN" ]; then
  echo "run-jsr-publish: pinned JSR CLI is unavailable; run npm ci" >&2
  exit 2
fi

if [ "${DENO_BIN_PATH:-}" != "" ]; then
  DENO_VERSION_LINE=$("$DENO_BIN_PATH" --version | head -n 1)
  if [[ "$DENO_VERSION_LINE" != "deno ${EXPECTED_DENO_VERSION}"* ]]; then
    echo "run-jsr-publish: DENO_BIN_PATH must provide Deno ${EXPECTED_DENO_VERSION}" >&2
    exit 2
  fi
elif command -v deno >/dev/null 2>&1; then
  PATH_DENO=$(command -v deno)
  DENO_VERSION_LINE=$("$PATH_DENO" --version | head -n 1)
  if [[ "$DENO_VERSION_LINE" == "deno ${EXPECTED_DENO_VERSION}"* ]]; then
    export DENO_BIN_PATH="$PATH_DENO"
  fi
fi

is_transient_failure() {
  printf '%s\n' "$1" | grep -Eiq \
    'ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|socket hang up|fetch failed|TypeError: terminated|429 Too Many Requests|50[234] (Bad Gateway|Service Unavailable|Gateway Timeout)'
}

ATTEMPT=1
while [ "$ATTEMPT" -le "$ATTEMPTS" ]; do
  set +e
  OUTPUT=$("$JSR_BIN" publish "$@" 2>&1)
  STATUS=$?
  set -e
  printf '%s\n' "$OUTPUT"

  if [ "$STATUS" -eq 0 ]; then
    exit 0
  fi
  if ! is_transient_failure "$OUTPUT"; then
    echo "Deterministic JSR failure; not retrying" >&2
    exit "$STATUS"
  fi
  if [ "$ATTEMPT" -eq "$ATTEMPTS" ]; then
    echo "Classified transient JSR failure exhausted ${ATTEMPTS} attempts" >&2
    exit "$STATUS"
  fi

  echo "Retrying classified transient JSR failure after attempt ${ATTEMPT}/${ATTEMPTS}" >&2
  if [ "$DELAY_SECONDS" -gt 0 ]; then
    sleep $((DELAY_SECONDS * ATTEMPT))
  fi
  ATTEMPT=$((ATTEMPT + 1))
done
