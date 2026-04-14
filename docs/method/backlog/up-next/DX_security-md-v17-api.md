# Update SECURITY.md code examples to v17 API

**Audit ref:** DQ01-M-05

`.github/SECURITY.md` lines 96-114 show:
```js
await graph.serve({ port: 3000, ... });
await graph.syncWith('http://peer:3000', { ... });
```

In the v17 API, these are `graph.sync.serve()` and `graph.sync.syncWith()`.

## Steps

1. Replace direct-on-graph API calls with v17 namespace form.
2. Verify examples are syntactically correct against WarpGraph interface.
