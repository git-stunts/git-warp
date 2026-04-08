# timeoutMs missing from WarpApp.open type surface

`timeoutMs` is accepted at runtime by `WarpApp.open()` but is not
declared in `index.d.ts`. TypeScript rejects it:

```text
error TS2353: Object literal may only specify known properties,
and 'timeoutMs' does not exist in type '{ graphName: string;
persistence: GraphPersistencePort; writerId: string; ... }'.
```

Found by: graft (flyingrobots/graft) during v0.4.0 WARP Level 1
integration.

Fix: either add `timeoutMs?: number` to the open options type, or
remove the runtime support if it's not a public option.

---
**Graveyarded:** 2026-04-08 — false positive. timeoutMs belongs on syncWith() (where it already exists), not on open(). Broader failure-mode policy filed as cool-idea DX_alfred-resilience-policy.
