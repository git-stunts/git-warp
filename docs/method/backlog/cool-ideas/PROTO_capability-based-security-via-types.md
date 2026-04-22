---
id: PROTO_capability-based-security-via-types
blocked_by: []
blocks: []
---

# Capability-based security via TypeScript narrowing

The capability-namespaced API (`graph.query.*`, `graph.patches.*`)
enables capability-based security at the type level. If a function
receives only `QueryCapability`, it literally cannot write to the
graph — the type system enforces read-only access. No runtime checks.

```typescript
async function readOnlyAnalysis(query: QueryCapability): Promise<Report> {
  const nodes = await query.getNodes();
  // query.patches — does not exist. Cannot mutate. Type error.
  return buildReport(nodes);
}
```

This is the TypeScript version of capability-based security. The
narrowing is structural, not ceremonial. A function that asks for
`QueryCapability` is making a machine-verifiable promise about what
it will and won't do.

Extensions:
- `ReadOnlyGraph = Pick<WarpGraph, 'query'>` — read-only handle
- Per-writer capabilities — only your writerId's patches
- Auditable capability grants — log which capabilities were handed out
