## Summary

<!-- 1-3 bullet points describing the change -->

## Issue

<!-- Required: reference at least one same-repository GitHub Issue, e.g. Fixes #123 or Refs #123. Pull request references do not satisfy this gate. -->

## Test plan

<!-- How was this tested? -->

## ADR checks

- [ ] This PR does **not** implement ADR 2 without satisfying ADR 3
- [ ] If this PR touches persisted op formats, I linked the ADR 3 readiness issue
- [ ] If this PR touches wire compatibility, I confirmed canonical-only ops are still rejected on the wire pre-cutover
- [ ] If this PR touches schema constants, I confirmed patch and checkpoint namespaces remain distinct
