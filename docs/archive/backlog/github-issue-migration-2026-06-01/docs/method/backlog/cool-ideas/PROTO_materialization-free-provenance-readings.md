---
id: PROTO_materialization-free-provenance-readings
blocked_by: []
blocks: []
feature: api-capabilities
---

# Materialization-free provenance readings

Explore a provenance reading API that answers "which admitted patches
justify this value?" without requiring a full graph materialization or
an eager provenance index tied to `_cachedState`.

Possible shape:

```text
const reading = graph.query.worldline().reading();
const proof = await reading.provenance.forNode("node-id");
```

The important part is the ownership boundary: provenance should hang
off a reading basis, not off a globally materialized graph cache.
