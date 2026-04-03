# ORSet.compact() returns CompactionReceipt

**Effort:** S

## Idea

`ORSet.compact(includedVV)` currently mutates the set in place and
returns nothing. The caller has to diff before/after metrics manually
(GCPolicy does this with `collectGCMetrics`).

Instead: `compact()` returns a `CompactionReceipt` — a frozen value
object with `{ dotsRemoved: number, elementsRemoved: number }`. The
caller gets structured feedback without manual diffing.

```javascript
const receipt = state.nodeAlive.compact(appliedVV);
logger.info(`GC: removed ${receipt.dotsRemoved} dots`);
```

This aligns with the Systems-Style manifesto: structured data stays
structured (no "count before, count after, subtract" pattern).
