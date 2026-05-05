#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "--view ascii info is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --view ascii info
  assert_view_removed
}

@test "--view ascii query is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii query --match "user:*"
  assert_view_removed
}

@test "--view ascii check is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii check
  assert_view_removed
}

@test "--view ascii history is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --view ascii history
  assert_view_removed
}

@test "--view ascii materialize is rejected with migration guidance" {
  run git warp --repo "${TEST_REPO}" --view ascii materialize
  assert_view_removed
}

@test "--view svg:FILE is rejected with migration guidance" {
  local svgfile="${TEST_REPO}/test-output.svg"
  run git warp --repo "${TEST_REPO}" --graph demo --view "svg:${svgfile}" query --match "user:*"
  assert_view_removed
  [ ! -f "${svgfile}" ]
}

@test "--view html:FILE is rejected with migration guidance" {
  local htmlfile="${TEST_REPO}/test-output.html"
  run git warp --repo "${TEST_REPO}" --graph demo --view "html:${htmlfile}" query --match "user:*"
  assert_view_removed
  [ ! -f "${htmlfile}" ]
}
