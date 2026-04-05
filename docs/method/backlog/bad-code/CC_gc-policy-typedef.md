# GCPolicy and related types are typedef-only

**Effort:** S

## What's wrong

`GCPolicy`, `GCShouldRunResult`, `GCExecuteResult`, and `GCMetrics` are all typedef-only types with clear invariants (ratios must be 0-1, thresholds must be positive) and no runtime backing. Invalid values pass silently through the system.

## Suggested fix

- Promote `GCPolicy` to a class with constructor validation: ratios clamped to `[0, 1]`, thresholds must be positive numbers (P1 + P2).
- Consider promoting result types (`GCShouldRunResult`, `GCExecuteResult`) to classes if they carry meaningful invariants or behavior.
- `GCMetrics` may remain a plain object if it is purely informational.
