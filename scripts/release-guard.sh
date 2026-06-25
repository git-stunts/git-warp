#!/usr/bin/env bash
# Release guard for tag-time policy gates.
#
# This script checks the gates that are independent of human judgment. It is
# intentionally shared by local preflight and the release workflow so release
# policy has one executable entry point.
set -euo pipefail

REPO="${GITHUB_REPOSITORY:-git-stunts/git-warp}"
TAG=""
STAGE="final-local"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --stage)
      if [ "$#" -lt 2 ]; then
        echo "release-guard: --stage requires a value" >&2
        exit 2
      fi
      STAGE="$2"
      shift 2
      ;;
    --tag)
      if [ "$#" -lt 2 ]; then
        echo "release-guard: --tag requires a value" >&2
        exit 2
      fi
      TAG="$2"
      shift 2
      ;;
    --repo)
      if [ "$#" -lt 2 ]; then
        echo "release-guard: --repo requires a value" >&2
        exit 2
      fi
      REPO="$2"
      shift 2
      ;;
    *)
      echo "release-guard: unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

case "$STAGE" in
  prep-pr | final-local | tag-workflow | rerun-workflow) ;;
  *)
    echo "release-guard: invalid stage: $STAGE" >&2
    exit 2
    ;;
esac

TAG_VERSION=""
TARGET_VERSION=""
TARGET_MILESTONE=""
FAILURES=0

REQUIRED_RELEASE_DOCS=(
  ".github/RELEASE.md"
  "README.md"
  "ARCHITECTURE.md"
  "CHANGELOG.md"
  "docs/operations/README.md"
  "docs/topics/README.md"
  "docs/topics/getting-started.md"
  "docs/topics/optic-reads.md"
  "docs/topics/observers.md"
  "docs/topics/querying.md"
  "docs/topics/strands.md"
  "docs/topics/git-substrate.md"
  "docs/topics/content-and-cas.md"
  "docs/topics/continuum-boundary.md"
  "docs/topics/sync.md"
  "docs/topics/cli.md"
  "docs/topics/reference.md"
  "docs/topics/troubleshooting.md"
)

RETIRED_DOC_PATHS=(
  "docs/archive"
  "docs/audits"
  "docs/design"
  "docs/images"
  "docs/invariants"
  "docs/method"
  "docs/migrations"
  "docs/releases"
  "docs/specs"
  "docs/trust"
  "docs/ROADMAP"
  "docs/ROADMAP.md"
  "docs/BEARING.md"
  "docs/VISION.md"
  "docs/GLOSSARY.md"
  "docs/DOCTRINE_RUNTIME_ALIGNMENT.md"
)

pass() {
  printf '  PASS %s %s\n' "$1" "$2"
}

fail() {
  printf '  FAIL %s %s\n' "$1" "$2"
  FAILURES=$((FAILURES + 1))
}

require_command() {
  if command -v "$1" >/dev/null 2>&1; then
    pass "$2" "$1 is available"
  else
    fail "$2" "$1 is not available"
  fi
}

require_gh_for_stage() {
  case "$STAGE" in
    final-local | tag-workflow)
      require_command gh "REL-TOOL-GH"
      ;;
    prep-pr | rerun-workflow)
      pass "REL-TOOL-GH" "gh is not required for $STAGE stage"
      ;;
  esac
}

derive_and_validate_tag() {
  if [ "$TAG" = "" ]; then
    if command -v node >/dev/null 2>&1; then
      TAG="v$(node -p "require('./package.json').version")"
    else
      fail "REL-TAG-DEFAULT" "cannot infer tag without node; pass --tag explicitly"
      TAG="v0.0.0"
    fi
  fi

  if [[ "$TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$ ]]; then
    TAG_VERSION="${TAG#v}"
    TARGET_VERSION="${TAG_VERSION%%-*}"
    TARGET_MILESTONE="v${TARGET_VERSION}"
    pass "REL-TAG-FORMAT" "$TAG is a valid release tag"
  else
    fail "REL-TAG-FORMAT" "$TAG is not vMAJOR.MINOR.PATCH or prerelease"
    TAG_VERSION="0.0.0"
    TARGET_VERSION="0.0.0"
    TARGET_MILESTONE="v${TARGET_VERSION}"
  fi
}

is_release_version() {
  [[ "$1" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-(rc|beta|alpha)\.[0-9]+)?$ ]]
}

semver_less_than() {
  node - "$1" "$2" <<'NODE'
const left = process.argv[2];
const right = process.argv[3];
const prereleaseRank = { alpha: 0, beta: 1, rc: 2 };

function parse(version) {
  const match = /^([0-9]+)\.([0-9]+)\.([0-9]+)(?:-(alpha|beta|rc)\.([0-9]+))?$/.exec(version);
  if (!match) {
    process.exit(2);
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4] === undefined ? null : {
      rank: prereleaseRank[match[4]],
      number: Number(match[5]),
    },
  };
}

function compare(leftVersion, rightVersion) {
  for (const field of ['major', 'minor', 'patch']) {
    if (leftVersion[field] !== rightVersion[field]) {
      return leftVersion[field] - rightVersion[field];
    }
  }
  if (leftVersion.prerelease === null && rightVersion.prerelease === null) {
    return 0;
  }
  if (leftVersion.prerelease !== null && rightVersion.prerelease === null) {
    return -1;
  }
  if (leftVersion.prerelease === null && rightVersion.prerelease !== null) {
    return 1;
  }
  if (leftVersion.prerelease.rank !== rightVersion.prerelease.rank) {
    return leftVersion.prerelease.rank - rightVersion.prerelease.rank;
  }
  return leftVersion.prerelease.number - rightVersion.prerelease.number;
}

process.exit(compare(parse(left), parse(right)) < 0 ? 0 : 1);
NODE
}

count_open_issues_with_label() {
  local label="$1"
  local search_query="repo:$REPO is:issue is:open label:\"$label\""
  gh api graphql \
    -f query='query($searchQuery: String!) { search(query: $searchQuery, type: ISSUE, first: 1) { issueCount } }' \
    -f searchQuery="$search_query" \
    --jq '.data.search.issueCount'
}

count_open_issues_with_milestone() {
  local milestone="$1"
  local search_query="repo:$REPO is:issue is:open milestone:\"$milestone\""
  gh api graphql \
    -f query='query($searchQuery: String!) { search(query: $searchQuery, type: ISSUE, first: 1) { issueCount } }' \
    -f searchQuery="$search_query" \
    --jq '.data.search.issueCount'
}

label_exists() {
  local label="$1"
  gh label list \
    --repo "$REPO" \
    --search "$label" \
    --limit 100 \
    --json name \
    --jq '.[].name' \
    | grep -Fx -- "$label" >/dev/null
}

milestone_exists() {
  local milestone="$1"
  gh api "repos/$REPO/milestones?state=all&per_page=100" \
    --paginate \
    --jq '.[].title' \
    | grep -Fx -- "$milestone" >/dev/null
}

list_release_milestones() {
  gh api "repos/$REPO/milestones?state=all&per_page=100" \
    --paginate \
    --jq '.[].title' \
    | grep '^v' || true
}

require_label() {
  local check_id="$1"
  local label="$2"
  if label_exists "$label"; then
    pass "$check_id" "GitHub label $label exists"
  else
    fail "$check_id" "GitHub label $label is missing"
  fi
}

require_milestone() {
  local check_id="$1"
  local milestone="$2"
  if milestone_exists "$milestone"; then
    pass "$check_id" "GitHub milestone $milestone exists"
  else
    fail "$check_id" "GitHub milestone $milestone is missing"
  fi
}

check_zero_label() {
  local check_id="$1"
  local label="$2"
  local count
  count="$(count_open_issues_with_label "$label")"
  if [ "$count" = "0" ]; then
    pass "$check_id" "no open issues labeled $label"
  else
    fail "$check_id" "$count open issue(s) labeled $label"
    gh issue list \
      --repo "$REPO" \
      --state open \
      --label "$label" \
      --limit 20 \
      --json number,title,url \
      --template '{{range .}}{{printf "#%v %s %s\n" .number .title .url}}{{end}}'
  fi
}

check_zero_milestone() {
  local check_id="$1"
  local milestone="$2"
  local count
  count="$(count_open_issues_with_milestone "$milestone")"
  if [ "$count" = "0" ]; then
    pass "$check_id" "no open issues in milestone $milestone"
  else
    fail "$check_id" "$count open issue(s) in milestone $milestone"
    gh issue list \
      --repo "$REPO" \
      --state open \
      --milestone "$milestone" \
      --limit 20 \
      --json number,title,url \
      --template '{{range .}}{{printf "#%v %s %s\n" .number .title .url}}{{end}}'
  fi
}

check_versions() {
  if TAG_VERSION="$TAG_VERSION" node <<'NODE'
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const expected = process.env.TAG_VERSION;
const failures = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function expectVersion(label, version) {
  if (version !== expected) {
    failures.push(`${label} version ${version} != ${expected}`);
  }
}

const rootPackage = readJson('package.json');
expectVersion('package.json', rootPackage.version);
expectVersion('jsr.json', readJson('jsr.json').version);

if (existsSync('package-lock.json')) {
  const lock = readJson('package-lock.json');
  expectVersion('package-lock.json root package', lock.packages[''].version);
}

for (const workspace of readdirSync('packages', { withFileTypes: true })) {
  if (!workspace.isDirectory()) {
    continue;
  }
  const packagePath = join('packages', workspace.name, 'package.json');
  if (!existsSync(packagePath)) {
    continue;
  }
  const workspacePackage = readJson(packagePath);
  expectVersion(packagePath, workspacePackage.version);
  if (workspacePackage.private !== true) {
    failures.push(`${packagePath} must remain private unless publish policy changes`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}
NODE
  then
    pass "REL-META-VERSION-LOCKSTEP" "package, JSR, lockfile, and workspace versions match $TAG_VERSION"
  else
    fail "REL-META-VERSION-LOCKSTEP" "release metadata is not version-locked"
  fi
}

check_clean_tree() {
  local status
  status="$(git status --porcelain)"
  if [ "$status" = "" ]; then
    pass "REL-GIT-CLEAN" "working tree is clean"
  else
    printf '%s\n' "$status"
    fail "REL-GIT-CLEAN" "working tree has uncommitted changes"
  fi
}

check_github_access() {
  if gh repo view "$REPO" --json nameWithOwner --jq '.nameWithOwner' >/dev/null 2>&1; then
    pass "REL-GH-ACCESS" "GitHub repository $REPO is readable"
  else
    fail "REL-GH-ACCESS" "cannot read GitHub repository $REPO through gh"
  fi
}

check_origin_main_exact() {
  local head main
  head="$(git rev-parse HEAD)"
  if ! main="$(git rev-parse origin/main 2>/dev/null)"; then
    fail "REL-GIT-ORIGIN-MAIN" "origin/main is unavailable; fetch origin main before release"
    return
  fi
  if [ "$head" = "$main" ]; then
    pass "REL-GIT-ORIGIN-MAIN" "HEAD matches origin/main at $head"
  else
    fail "REL-GIT-ORIGIN-MAIN" "HEAD $head does not match origin/main $main"
  fi
}

check_origin_main_ancestor() {
  local head main
  head="$(git rev-parse HEAD)"
  if ! main="$(git rev-parse origin/main 2>/dev/null)"; then
    fail "REL-GIT-ORIGIN-MAIN" "origin/main is unavailable; fetch origin main before release"
    return
  fi
  if git merge-base --is-ancestor "$head" "$main"; then
    pass "REL-GIT-ORIGIN-MAIN" "HEAD $head is reachable from origin/main $main for workflow rerun"
  else
    fail "REL-GIT-ORIGIN-MAIN" "HEAD $head is not reachable from origin/main $main"
  fi
}

check_stage_git_posture() {
  case "$STAGE" in
    prep-pr)
      pass "REL-GIT-STAGE" "prep-pr validates branch-local release content before merge"
      ;;
    final-local | tag-workflow)
      check_origin_main_exact
      ;;
    rerun-workflow)
      check_origin_main_ancestor
      ;;
  esac
}

check_changelog() {
  if grep -qE "^\#*\s*\[?${TAG_VERSION}\]?\s*[—–-]\s*[0-9]{4}-[0-9]{2}-[0-9]{2}" CHANGELOG.md; then
    pass "REL-DOC-CHANGELOG-DATED" "CHANGELOG has a dated entry for $TAG_VERSION"
  else
    fail "REL-DOC-CHANGELOG-DATED" "CHANGELOG lacks a dated entry for $TAG_VERSION"
  fi
}

check_release_evidence() {
  local missing=0
  local retired=0

  for path in "${REQUIRED_RELEASE_DOCS[@]}"; do
    if [ ! -f "$path" ]; then
      printf '    missing release doc: %s\n' "$path"
      missing=$((missing + 1))
    fi
  done

  for path in "${RETIRED_DOC_PATHS[@]}"; do
    if [ -e "$path" ]; then
      printf '    retired docs path still exists: %s\n' "$path"
      retired=$((retired + 1))
    fi
  done

  if [ "$missing" -eq 0 ] && [ "$retired" -eq 0 ]; then
    pass "REL-DOC-EVIDENCE" "release evidence lives in CHANGELOG.md and the consolidated docs topology"
  else
    fail "REL-DOC-EVIDENCE" "$missing required release doc(s) missing; $retired retired docs path(s) present"
  fi
}

check_issue_gates() {
  require_label "REL-GH-PRIORITY-ASAP-LABEL" "priority:asap"
  check_zero_label "REL-GH-ASAP-ZERO" "priority:asap"
  require_milestone "REL-GH-TARGET-MILESTONE-EXISTS" "$TARGET_MILESTONE"
  check_zero_milestone "REL-GH-TARGET-MILESTONE-ZERO" "$TARGET_MILESTONE"

  local prior_failures=0
  local malformed_milestones=0
  while IFS= read -r milestone; do
    [ "$milestone" = "" ] && continue
    case "$milestone" in
      v*) ;;
      *) continue ;;
    esac
    local version="${milestone#v}"
    if ! is_release_version "$version"; then
      printf '    malformed release milestone: %s\n' "$milestone"
      malformed_milestones=$((malformed_milestones + 1))
      continue
    fi
    if semver_less_than "$version" "$TARGET_VERSION"; then
      local count
      count="$(count_open_issues_with_milestone "$milestone")"
      if [ "$count" != "0" ]; then
        printf '    milestone %s has %s open issue(s)\n' "$milestone" "$count"
        prior_failures=$((prior_failures + count))
      fi
    fi
  done < <(list_release_milestones)

  if [ "$malformed_milestones" -eq 0 ]; then
    pass "REL-GH-PRIOR-RELEASE-MILESTONES" "all release milestones use release SemVer"
  else
    fail "REL-GH-PRIOR-RELEASE-MILESTONES" "$malformed_milestones malformed release milestone(s)"
  fi

  if [ "$prior_failures" -eq 0 ]; then
    pass "REL-GH-PRIOR-RELEASE-ZERO" "no open prior-release milestone issues before v${TARGET_VERSION}"
  else
    fail "REL-GH-PRIOR-RELEASE-ZERO" "$prior_failures open issue(s) remain from prior release milestones"
  fi
}

check_stage_issue_gates() {
  case "$STAGE" in
    prep-pr)
      pass "REL-GH-STAGE" "prep-pr skips live issue-zero gates until final tag preflight"
      ;;
    final-local | tag-workflow)
      check_github_access
      check_issue_gates
      ;;
    rerun-workflow)
      pass "REL-GH-STAGE" "rerun-workflow skips live issue-zero gates for existing-tag registry recovery"
      ;;
  esac
}

require_command node "REL-TOOL-NODE"
require_command git "REL-TOOL-GIT"
require_gh_for_stage

derive_and_validate_tag

echo "Release guard:"
echo "  repo: $REPO"
echo "  tag:  $TAG"
echo "  stage: $STAGE"
echo ""

check_versions
check_clean_tree
check_stage_git_posture
check_changelog
check_release_evidence
check_stage_issue_gates

echo ""
if [ "$FAILURES" -eq 0 ]; then
  echo "release-guard: all gates passed"
else
  echo "release-guard: $FAILURES gate(s) failed"
fi

exit "$FAILURES"
