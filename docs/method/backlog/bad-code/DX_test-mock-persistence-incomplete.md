# 20+ test files create incomplete persistence mocks

**Effort:** M

## What's Wrong

At least 20 test files create inline mock persistence objects missing
methods required by CorePersistence (readBlob, writeBlob, getNodeInfo,
readTreeOids, writeTree, etc.). The `requireCapabilities` runtime
validation exposed this — we had to patch 22 files in one session.

The root cause is that `createMockPersistence()` exists but most tests
don't use it, opting for ad-hoc partial objects instead.

## Suggested Fix

1. Mandate `createMockPersistence()` usage across all test files.
2. Add an ESLint rule or test helper that fails if a raw object
   literal is passed to `WarpRuntime.open()` without all required
   methods.
3. Audit remaining test files for partial mocks and migrate them.
