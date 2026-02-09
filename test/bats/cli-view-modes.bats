#!/usr/bin/env bats

load helpers/setup.bash

setup() {
  setup_test_repo
  seed_graph "seed-graph.js"
}

teardown() {
  teardown_test_repo
}

@test "--view ascii info produces output" {
  run git warp --repo "${TEST_REPO}" --view ascii info
  assert_success
  [ -n "$output" ]
}

@test "--view ascii query produces output" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii query --match "user:*"
  assert_success
  [ -n "$output" ]
}

@test "--view ascii check produces output" {
  run git warp --repo "${TEST_REPO}" --graph demo --view ascii check
  assert_success
  [ -n "$output" ]
}

@test "--view ascii history produces output" {
  run git warp --repo "${TEST_REPO}" --graph demo --writer alice --view ascii history
  assert_success
  [ -n "$output" ]
}

@test "--view ascii materialize produces output" {
  run git warp --repo "${TEST_REPO}" --view ascii materialize
  assert_success
  [ -n "$output" ]
}

@test "--view svg:FILE creates SVG file" {
  local svgfile="${TEST_REPO}/test-output.svg"
  run git warp --repo "${TEST_REPO}" --graph demo --view "svg:${svgfile}" query --match "user:*"
  assert_success
  [ -f "${svgfile}" ]
  grep -q '<svg' "${svgfile}"
}

@test "--view html:FILE creates HTML file" {
  local htmlfile="${TEST_REPO}/test-output.html"
  run git warp --repo "${TEST_REPO}" --graph demo --view "html:${htmlfile}" query --match "user:*"
  assert_success
  [ -f "${htmlfile}" ]
  grep -q '<html' "${htmlfile}" || grep -q '<!DOCTYPE' "${htmlfile}" || grep -q '<svg' "${htmlfile}"
}
