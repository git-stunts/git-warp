---
id: SPEC_static-text-test-sludge-btr-signing-bytes-ownership
blocked_by: []
blocks: []
feature: testing-quality
release_home: v17.0.0
---

# Static text assertions in `test/conformance/btrSigningBytesOwnership.test.ts`

**Effort:** S

This file reads design, sludge-map, and refactoring-guide text to
assert that BtrSigningBytes ownership is documented with particular
phrases and anti-pattern names.

Replace it with behavior that proves the codec constructs canonical
BtrSigningBytes, the HMAC consumer accepts only that value, and ports
return the runtime-backed domain object. Keep doctrine wording checks
out of the runtime test lane.
