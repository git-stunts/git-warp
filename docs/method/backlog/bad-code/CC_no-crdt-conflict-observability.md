# No observability for CRDT conflict resolution rates

**Effort:** S

Default materialization (applyFast in JoinReducer) produces no
telemetry. Operators cannot:

- Count superseded writes (LWW losses) per materialization
- Detect write amplification from lagging writers
- Alert on divergence rates between writers

The TickReceipt system tracks outcomes but only when
`collectReceipts: true` is passed. The effect pipeline exists
but materialization doesn't emit CRDT metrics through it.

## Suggested fix

Add lightweight counter mode to applyFast that tracks
applied/superseded/redundant counts without full receipts. Emit
as materialization summary through the effect pipeline.
