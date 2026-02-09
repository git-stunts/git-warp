#!/usr/bin/env bash
# Shared BATS test helpers for git-warp CLI tests.

# Sets up a fresh temporary git repo and PROJECT_ROOT.
# Usage: call setup_test_repo in your setup() function.
setup_test_repo() {
  PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  export PROJECT_ROOT
  export TEST_REPO
  TEST_REPO="$(mktemp -d)"
  cd "${TEST_REPO}" || return 1

  git init >/dev/null
  git config user.email "test@test.com"
  git config user.name "Test"
  export GIT_AUTHOR_NAME="Test"
  export GIT_AUTHOR_EMAIL="test@test.com"
  export GIT_COMMITTER_NAME="Test"
  export GIT_COMMITTER_EMAIL="test@test.com"
}

# Removes the temporary repo.
# Usage: call teardown_test_repo in your teardown() function.
teardown_test_repo() {
  rm -rf "${TEST_REPO}"
}

# Assert that the last command succeeded (exit code 0).
assert_success() {
  if [ "$status" -ne 0 ]; then
    echo "FAILED (exit $status):" >&2
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
}

# Assert that the last command failed (exit code != 0).
assert_failure() {
  [ "$status" -ne 0 ]
}

# Seeds a standard demo graph via a helper JS script.
# Args: $1 = seed script name (e.g., "seed-graph.js")
seed_graph() {
  local script="${BATS_TEST_DIRNAME}/helpers/${1}"
  cd "${PROJECT_ROOT}" || return 1
  REPO_PATH="${TEST_REPO}" node "${script}"
  cd "${TEST_REPO}" || return 1
}
