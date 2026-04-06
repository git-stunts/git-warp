# timeoutMs missing from WarpApp.open type surface

`timeoutMs` is accepted at runtime by `WarpApp.open()` but is not
declared in `index.d.ts`. TypeScript rejects it:

```
error TS2353: Object literal may only specify known properties,
and 'timeoutMs' does not exist in type '{ graphName: string;
persistence: GraphPersistencePort; writerId: string; ... }'.
```

Found by: graft (flyingrobots/graft) during v0.4.0 WARP Level 1
integration.

Fix: either add `timeoutMs?: number` to the open options type, or
remove the runtime support if it's not a public option.
