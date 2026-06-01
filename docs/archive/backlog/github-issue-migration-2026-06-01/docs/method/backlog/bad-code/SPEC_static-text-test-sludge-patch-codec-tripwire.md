---
id: SPEC_static-text-test-sludge-patch-codec-tripwire
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/unit/boundary/patch-codec-tripwire.test.ts`

**Effort:** S

This file reads domain source files and regex-scans them for forbidden
codec imports and encode/decode calls.

Replace it with parser-backed architecture policy tooling for import
law, plus behavioral boundary tests proving patch, checkpoint, and
index services exchange domain objects through codec ports.
