---
id: CAST_openWarpGraph-cast-cosplay
blocked_by: []
blocks: []
---

# openWarpGraph() uses 9 `as unknown as` casts at trust boundary

**Effort:** M

## What's Wrong

`WarpGraph.ts:215-223` — the capability bag construction uses 9
`as unknown as <Capability>` casts to wire runtime methods into the
capability interfaces. This is cast-cosplay at the system's most
important trust boundary — the public API surface.

The compiler cannot verify that the runtime object actually satisfies
the capability interface. If a method is renamed or removed, the
cast silently succeeds and the consumer gets a runtime crash.

## Suggested Fix

Use runtime capability assertion similar to `requireCapabilities.ts`
pattern:
```ts
function assertCapability<T>(obj: unknown, methods: (keyof T)[]): T {
  for (const m of methods) {
    if (typeof (obj as Record<string, unknown>)[m as string] !== 'function') {
      throw new InvariantViolation(`Missing capability method: ${String(m)}`);
    }
  }
  return obj as T;
}
```
This converts a silent cast into a fail-fast runtime check.
