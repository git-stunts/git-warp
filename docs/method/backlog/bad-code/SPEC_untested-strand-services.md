---
id: SPEC_untested-strand-services
blocked_by: []
blocks: []
---

# CC_untested-strand-services

**Title:** StrandService (2060 LOC) and ConflictAnalyzerService (2582 LOC) have zero tests
**Effort:** L

## Issue

The two largest files in the codebase have zero dedicated test files.
StrandService handles strand creation, overlay writes, materialization,
ticking, intent queues, braid management. ConflictAnalyzerService
handles conflict classification, evidence collection, receipt replay,
target matching. Combined 4642 LOC with zero direct test coverage.

## Fix

These are the highest-risk untested code in the codebase. Create test
files with at least basic happy-path coverage before any refactoring.
Test the public API surface first, then add edge cases.
