---
id: SPEC_patch-session-untested
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# PatchSession.js (349 LOC) has zero tests and parses error messages

**Effort:** S

## Issue

PatchSession handles the patch commit lifecycle including retry logic
and error classification. `_classifyCommitError` parses `err.message`
strings ("raccoon in a dumpster" per SSJS). Zero dedicated tests for a
module that handles concurrent commit races.

**Related:** `CC_patch-session-message-parsing.md` covers the message
parsing smell specifically. This item covers the broader test coverage
gap.

## Fix

Create unit tests. Replace message parsing with error class
`instanceof` checks. Test the retry/race path.
