---
id: CAST_reducer-silent-unknown-op-type
blocked_by: []
blocks: []
feature: docs-dx
---

# Reducer silently no-ops unknown op types — typos become silent data loss

**Effort:** XS

## What's wrong

`JoinReducer.ts` (and the old `JoinReducer.js`) apply loop:

```ts
const strategy = OP_STRATEGIES.get(canonOp.type);
if (!strategy) { continue; } // Unknown ops silently ignored (forward-compat)
```

A misspelled op type (`'NodeAddd'`, `'RenameNode'`, `'EdgeDelete'`)
doesn't throw, doesn't log, doesn't even increment a counter. The op
is silently discarded and the state proceeds as if nothing happened.

The comment claims this is for "forward compatibility" — a newer writer
emitting an op type the older reducer doesn't know about. But that same
code path catches typos, internal bugs, and downgrade scenarios, and
treats them all as a no-op.

## Why it's load-bearing

- A typo in a unit test fixture produces "green" tests that never
  actually apply the op being tested.
- A downgrade scenario (new writer emits op unknown to old reducer)
  silently corrupts the state without any operator visibility.
- Forward-compat and internal-bug look identical on the wire.

## Suggested fix

1. Route through the logger port when available. At minimum:
   ```ts
   if (!strategy) {
     logger?.warn(`reducer.unknownOpType`, { type: canonOp.type, patchSha });
     continue;
   }
   ```
2. Expose a metric (counter of skipped op types per reducer run) that
   the metrics port reads.
3. Consider a "strict" mode flag that throws instead of warns, enabled
   by default in tests. Forward-compat mode is opt-in, not default.

## Severity

MEDIUM. Silent failure is the worst class of failure. The tradeoff with
forward compat is real, but the current balance is wrong — we default
to silence when silence is the unsafest option.
