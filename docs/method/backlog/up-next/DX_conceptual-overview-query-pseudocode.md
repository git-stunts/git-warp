# Fix CONCEPTUAL_OVERVIEW.md query example

**Audit ref:** DQ01-M-02

`docs/CONCEPTUAL_OVERVIEW.md` line 40 shows:
```javascript
graph.query()
  .match('user:*')
  .where({ role: 'admin' })
```

This does not match either the v16 API or the v17 API. It appears to be
pseudocode that doesn't work with any actual version.

## Steps

1. Either label as pseudocode/illustrative, or
2. Update to match the actual v17 API:
   ```ts
   const results = await graph.query.queryBuilder()
     .match('user:*')
     .where({ role: 'admin' })
     .execute();
   ```
