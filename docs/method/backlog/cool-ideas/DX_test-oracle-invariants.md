---
id: DX_test-oracle-invariants
blocked_by: []
blocks: []
---

# Test oracle invariants — assert what MUST be true, not what IS true

The removeNode tests asked: "what does removeNode return when state
is null?" Answer: empty array. Test passed. Bug blessed.

The right question: "is the return value of removeNode ever
correct when observedDots is empty?" Answer: NO. An empty
observedDots means the remove will have no effect. That is NEVER
a valid outcome for a user who called removeNode.

This is the difference between a **behavioral test** (what does
the code do?) and an **oracle test** (is the output valid?).

Oracle invariants for git-warp's write path:

1. After removeNode(X), if X existed before, X must not be alive
   after materialization. (The removeNode test didn't check this.)
2. A NodeRemove op with empty observedDots is ALWAYS a bug.
   (No test checked this invariant.)
3. A committed patch with N remove ops must have N non-empty
   observedDots arrays. (No test checked this.)
4. After any patch.commit(), the writer ref must advance.
   (Integration tests check this, unit tests don't.)

These invariants should be encoded as reusable assertion helpers:

```javascript
function assertValidRemoveOp(op) {
  expect(op.observedDots.length).toBeGreaterThan(0);
}

function assertRemoveEffective(graph, nodeId) {
  const obs = graph.observer();
  expect(obs.hasNode(nodeId)).toBe(false);
}
```

The invariants live in test/helpers/ and are used by every test
that exercises removes. If the invariant is ever violated, the
test fails with a clear message about what MUST be true, not
just what the code happened to return.
