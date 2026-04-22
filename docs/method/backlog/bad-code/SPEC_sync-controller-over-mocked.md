---
id: SPEC_sync-controller-over-mocked
blocked_by: []
blocks: []
---

# SyncController tests mock 3 modules — test only proves wiring

**Effort:** M

## Issue

`SyncController.test.js` uses THREE `vi.mock()` calls (SyncProtocol,
HttpSyncServer, `@git-stunts/alfred`) plus a 20-property mock host.
The real `applySyncResponse` is never exercised. If SyncProtocol
changes its return shape, these tests still pass. Tests prove mock
wiring, not actual sync flow.

## Fix

Replace module mocks with lightweight fakes that implement the real
interface. Or add integration-style tests that exercise the real
SyncProtocol through the controller.
