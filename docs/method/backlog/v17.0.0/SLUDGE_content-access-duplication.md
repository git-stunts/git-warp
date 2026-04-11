---
id: SLUDGE_content-access-duplication
blocks: []
blocked_by: []
---

# De-duplicate content access methods (8 → 2 objects)

## The sludge

QueryController has 8 near-identical content methods:

```
getContentOid(nodeId)           getEdgeContentOid(from, to, label)
getContentMeta(nodeId)          getEdgeContentMeta(from, to, label)
getContent(nodeId)              getEdgeContent(from, to, label)
getContentStream(nodeId)        getEdgeContentStream(from, to, label)
```

4 operations × 2 targets. Each pair does the same thing with different
register lookup logic. The register lookup is the only difference —
node registers use `encodePropKey(nodeId, '_content')`, edge registers
use `encodeEdgePropKey(from, to, label, '_content')`.

## The fix

Two content accessor classes: `NodeContent` and `EdgeContent`. Each
owns `oid()`, `meta()`, `bytes()`, `stream()`. The register lookup
is polymorphic — each class knows how to find its registers.

```typescript
// Public API
const content = graph.query.nodeContent(nodeId);
const oid = content.oid();
const meta = content.meta();
const bytes = await content.bytes();
const stream = content.stream();

const edgeContent = graph.query.edgeContent(from, to, label);
// Same 4 methods
```

This cuts 8 methods to 2 factory methods on QueryCapability, and the
actual I/O lives on the content accessor — behavior on the object.
