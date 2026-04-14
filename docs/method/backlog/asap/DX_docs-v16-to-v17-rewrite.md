# Rewrite GETTING_STARTED, GUIDE, and API_REFERENCE for v17 API

**Audit ref:** DQ01-C-02, DQ01-M-04

All three primary user-journey docs use `WarpApp.open()` as the entry point
and `app.worldline()`, `app.patch()` patterns. None mention `openWarpGraph()`.

| Doc                        | Lines | API shown          | Should show         |
|----------------------------|-------|--------------------|---------------------|
| `docs/GETTING_STARTED.md`  | 179   | `WarpApp.open()`   | `openWarpGraph()`   |
| `docs/GUIDE.md`            | 328   | `WarpApp.open()`   | `openWarpGraph()`   |
| `docs/API_REFERENCE.md`    | 2422  | `WarpApp.open()`   | `openWarpGraph()`   |

A new user following README → GETTING_STARTED encounters two completely
different API styles with no bridge.

## Steps

1. Rewrite all three docs using `openWarpGraph()` as primary entry point.
2. Use capability-namespace pattern: `graph.patches.createPatch()`,
   `graph.query.getNodeProps()`, `graph.materialize.materialize()`.
3. Add a note that `WarpApp.open()` still works for backward compat.
4. Canonical namespace form: flat aliases (`graph.patches`).
5. Verify each code example compiles against `WarpGraph` interface.
