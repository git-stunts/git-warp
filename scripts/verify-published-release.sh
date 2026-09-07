#!/usr/bin/env bash
# Verify public artifacts without publishing or changing a public identity.
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
REPO="git-stunts/git-warp"
TAG=""
EXPECTED_COMMIT=""
RUN_ID=""
DIST_TAG="latest"
OUTPUT=""
REQUIRE_DIST_TAG=0
ATTEMPTS="${GIT_WARP_CLOSURE_ATTEMPTS:-6}"
DELAY="${GIT_WARP_CLOSURE_DELAY_SECONDS:-10}"
COMMAND_TIMEOUT="${GIT_WARP_CLOSURE_COMMAND_TIMEOUT_SECONDS:-180}"
TOTAL_TIMEOUT="${GIT_WARP_CLOSURE_TOTAL_TIMEOUT_SECONDS:-720}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --require-dist-tag) REQUIRE_DIST_TAG=1; shift; continue ;;
    --tag | --commit | --run-id | --dist-tag | --output)
      [ "$#" -ge 2 ] || { echo "missing value for $1" >&2; exit 2; }
      case "$1" in
        --tag) TAG="$2" ;;
        --commit) EXPECTED_COMMIT="$2" ;;
        --run-id) RUN_ID="$2" ;;
        --dist-tag) DIST_TAG="$2" ;;
        --output) OUTPUT="$2" ;;
      esac
      shift 2 ;;
    *) echo "unexpected argument: $1" >&2; exit 2 ;;
  esac
done

[[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-(alpha|beta|rc)\.[0-9]+)?$ ]] || exit 2
[[ "$EXPECTED_COMMIT" =~ ^[0-9a-f]{40}$ ]] || exit 2
[[ "$RUN_ID" =~ ^[1-9][0-9]*$ ]] || exit 2
[[ "$DIST_TAG" =~ ^(latest|alpha|beta|next)$ ]] || exit 2
[[ "$ATTEMPTS" =~ ^[1-9][0-9]*$ ]] && [ "$ATTEMPTS" -le 10 ] || exit 2
[[ "$DELAY" =~ ^[0-9]+$ ]] && [ "$DELAY" -le 30 ] || exit 2
[[ "$COMMAND_TIMEOUT" =~ ^[1-9][0-9]*$ ]] && [ "$COMMAND_TIMEOUT" -le 180 ] || exit 2
[ -n "$OUTPUT" ] || exit 2
for tool in jq timeout git gh npm curl openssl node; do command -v "$tool" >/dev/null; done
# shellcheck source=scripts/release-closure/budget.sh
source "$ROOT/scripts/release-closure/budget.sh"
start_budget "$TOTAL_TIMEOUT" "$COMMAND_TIMEOUT"

VERSION="${TAG#v}"
WORK=$(mktemp -d "${TMPDIR:-/tmp}/git-warp-release-closure.XXXXXX")
mkdir -p "$(dirname "$OUTPUT")"
OUTPUT=$(cd "$(dirname "$OUTPUT")" && pwd)/$(basename "$OUTPUT")
STAGE="source"
STATUS="failed"
for document in npm jsr run release consumer; do printf '{}\n' > "$WORK/$document.json"; done
printf 'null\n' > "$WORK/dist-tag.json"

finish() {
  local code=$?
  trap - EXIT
  jq -n --arg status "$STATUS" --arg stage "$STAGE" --arg tag "$TAG" \
    --arg version "$VERSION" --arg commit "$EXPECTED_COMMIT" --arg distTag "$DIST_TAG" \
    --argjson limit "$TOTAL_TIMEOUT" --argjson remaining "$((CLOSURE_DEADLINE - SECONDS))" \
    --argjson requireDistTag "$REQUIRE_DIST_TAG" \
    --slurpfile npm "$WORK/npm.json" --slurpfile jsr "$WORK/jsr.json" \
    --slurpfile run "$WORK/run.json" --slurpfile release "$WORK/release.json" \
    --slurpfile consumer "$WORK/consumer.json" --slurpfile owner "$WORK/dist-tag.json" \
    '{schema:"git-warp/release-closure@1",status:$status,stage:$stage,tag:$tag,
      version:$version,sourceCommit:$commit,
      budget:{limitSeconds:$limit,exhausted:($remaining<=0)},
      publishRun:($run[0]|{id,head_sha,html_url,path}),
      githubRelease:($release[0]|{id,tag_name,html_url}),
      npm:($npm[0]|{name,version,gitHead,integrity:.dist.integrity,
        provenance:.dist.attestations.provenance,signatures:.dist.signatures}),
      jsr:($jsr[0]|{name,version,integrity:.dist.integrity}),
      distTag:{name:$distTag,observedVersion:$owner[0],
        ownsTag:($owner[0]==$version),ownershipRequired:($requireDistTag==1)},
      consumer:$consumer[0]}' > "$OUTPUT"
  rm -rf "$WORK"
  echo "release closure: $STATUS ($STAGE)"
  exit "$code"
}
trap finish EXIT

fail() { echo "release closure failed: $1" >&2; exit 1; }

github_metadata() {
  bounded gh api "repos/$REPO/$1" > "$WORK/github-pending.json"
  jq -e 'type=="object"' "$WORK/github-pending.json" >/dev/null
  mv "$WORK/github-pending.json" "$2"
}

registry_metadata() {
  local package="$1" registry="$2" destination="$3"
  local attempt=1
  while [ "$attempt" -le "$ATTEMPTS" ]; do
    if bounded npm view "$package@$VERSION" name version gitHead dist --json \
      --registry="$registry" --fetch-retries=0 --fetch-timeout=15000 > "$WORK/pending.json" 2> "$WORK/registry-error.log"; then
      jq -e --arg package "$package" --arg version "$VERSION" '
        type=="object" and .name==$package and .version==$version and
        (.dist.integrity|type=="string" and startswith("sha512-")) and
        (.dist.tarball|type=="string" and startswith("https://"))
      ' "$WORK/pending.json" >/dev/null || fail "invalid registry identity or integrity"
      mv "$WORK/pending.json" "$destination"
      return
    fi
    [ "$attempt" -lt "$ATTEMPTS" ] || fail "registry visibility exhausted $ATTEMPTS attempts"
    echo "registry visibility pending: attempt $attempt/$ATTEMPTS"
    bounded sleep "$DELAY"
    attempt=$((attempt + 1))
  done
}

LOCAL_COMMIT=$(bounded git -C "$ROOT" rev-parse "$TAG^{commit}")
[ "$LOCAL_COMMIT" = "$EXPECTED_COMMIT" ] || fail "local tag commit mismatch"
bounded gh api "repos/$REPO/commits/$TAG" --jq .sha > "$WORK/remote-commit"
[ "$(cat "$WORK/remote-commit")" = "$EXPECTED_COMMIT" ] || fail "public tag commit mismatch"
bounded git -C "$ROOT" show "$TAG:package.json" > "$WORK/package.json"
bounded git -C "$ROOT" show "$TAG:jsr.json" > "$WORK/jsr-package.json"
PACKAGE=$(jq -er --arg version "$VERSION" 'select(.version==$version)|.name' "$WORK/package.json")
JSR_NAME=$(jq -er --arg version "$VERSION" 'select(.version==$version)|.name' "$WORK/jsr-package.json")
JSR_SCOPE="${JSR_NAME%%/*}"
JSR_LEAF="${JSR_NAME#*/}"
JSR_PACKAGE="@jsr/${JSR_SCOPE#@}__${JSR_LEAF}"

github_metadata "actions/runs/$RUN_ID" "$WORK/run.json"
jq -e --arg commit "$EXPECTED_COMMIT" --arg repo "$REPO" \
  '.head_sha==$commit and .repository.full_name==$repo and .path==".github/workflows/release.yml"' \
  "$WORK/run.json" >/dev/null || fail "publishing workflow identity mismatch"
github_metadata "releases/tags/$TAG" "$WORK/release.json"
jq -e --arg tag "$TAG" '.tag_name==$tag and .draft==false and (.id|type=="number")' \
  "$WORK/release.json" >/dev/null || fail "GitHub Release identity mismatch"

STAGE="registry"
registry_metadata "$PACKAGE" https://registry.npmjs.org "$WORK/npm.json"
jq -e --arg commit "$EXPECTED_COMMIT" '.gitHead==$commit' "$WORK/npm.json" >/dev/null \
  || fail "npm gitHead mismatch"
jq -e '.dist.attestations.provenance.predicateType=="https://slsa.dev/provenance/v1"' \
  "$WORK/npm.json" >/dev/null || fail "npm provenance is unavailable"
registry_metadata "$JSR_PACKAGE" https://npm.jsr.io "$WORK/jsr.json"
bounded npm view "$PACKAGE" dist-tags --json --registry=https://registry.npmjs.org \
  --fetch-retries=0 --fetch-timeout=15000 > "$WORK/dist-tags.json"
jq -e 'type=="object"' "$WORK/dist-tags.json" >/dev/null
jq --arg name "$DIST_TAG" '(.[$name] // null)|
  if .==null or type=="string" then . else error("invalid dist-tag value") end' \
  "$WORK/dist-tags.json" > "$WORK/dist-tag.json"
if [ "$REQUIRE_DIST_TAG" -eq 1 ]; then
  jq -e --arg version "$VERSION" '.==$version' "$WORK/dist-tag.json" >/dev/null \
    || fail "new publication does not own its intended dist-tag"
fi

STAGE="jsr-integrity"
JSR_TARBALL=$(jq -er '.dist.tarball|select(startswith("https://npm.jsr.io/"))' "$WORK/jsr.json")
bounded curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' \
  --connect-timeout 10 --max-time 90 "$JSR_TARBALL" -o "$WORK/jsr.tgz"
JSR_INTEGRITY="sha512-$(bounded openssl dgst -sha512 -binary "$WORK/jsr.tgz" | openssl base64 -A)"
[ "$JSR_INTEGRITY" = "$(jq -r .dist.integrity "$WORK/jsr.json")" ] || fail "JSR tarball integrity mismatch"

STAGE="consumer"
CONSUMER_BUDGET=$(budget_remaining)
timeout --kill-after=5s "${CONSUMER_BUDGET}s" \
  bash "$ROOT/scripts/release-closure/consumer.sh" "$WORK" "$PACKAGE" "$VERSION" "$CONSUMER_BUDGET"
budget_remaining >/dev/null
STAGE="complete"
STATUS="verified"
