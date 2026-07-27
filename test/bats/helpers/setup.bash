#!/usr/bin/env bash

setup_test_repo() {
  _BATS_T0=$(date +%s)
  PROJECT_ROOT="$(cd "${BATS_TEST_DIRNAME}/../.." && pwd)"
  TEST_REPO="$(mktemp -d)"
  CLI=(node "${PROJECT_ROOT}/dist/bin/git-warp.js" --repo "${TEST_REPO}")
  export PROJECT_ROOT TEST_REPO

  git -C "${TEST_REPO}" init -q
  git -C "${TEST_REPO}" config user.email "test@git-warp.local"
  git -C "${TEST_REPO}" config user.name "Git Warp Test"
  export GIT_AUTHOR_NAME="Git Warp Test"
  export GIT_AUTHOR_EMAIL="test@git-warp.local"
  export GIT_COMMITTER_NAME="Git Warp Test"
  export GIT_COMMITTER_EMAIL="test@git-warp.local"
}

teardown_test_repo() {
  rm -rf "${TEST_REPO}"
  local elapsed=$(( $(date +%s) - _BATS_T0 ))
  echo "ENDED TEST: ${BATS_TEST_DESCRIPTION} took ${elapsed}s" >&3
}

assert_success() {
  if [ "$status" -ne 0 ]; then
    echo "FAILED (exit $status):" >&2
    echo "$output" >&2
  fi
  [ "$status" -eq 0 ]
}

assert_failure() {
  [ "$status" -ne 0 ]
}

write_user() {
  run "${CLI[@]}" write \
    --lane users \
    --writer bats \
    --json \
    --intent '{"kind":"node.add","subject":"user:alice"}'
  assert_success
}

prepare_user_reading() {
  write_user
  run "${CLI[@]}" repair \
    --lane users \
    --writer bats \
    --json \
    --action materialization
  assert_success
}
