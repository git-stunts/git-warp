---
id: DX_test-file-wildcard-ratchet
feature: testing-quality
blocked_by: []
blocks: []
---

# Test-File Wildcard Ratchet

**Effort:** S

## Problem

`ts-policy-check.js` excludes test files entirely. Need to either add a separate ratchet with higher threshold or document exclusion as intentional.

## Notes

- File: `scripts/ts-policy-check.js`
- Part of P3 Type Safety tier
