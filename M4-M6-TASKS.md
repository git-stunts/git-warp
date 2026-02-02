# Milestones 4–6 Tasks Checklist

## Milestone 4 — One-line Sync Transport

### M4.1 — graph.serve({ port })
- [x] Implement `graph.serve({ port, host?, path?, maxRequestBytes? })` returning `{ close(), url }`.
- [x] Built-in HTTP server; POST /sync JSON request/response.
- [x] Content-Type check (accept missing), request size limit, proper status codes.
- [x] Canonical JSON response ordering.
- [x] Tests: success, invalid JSON, size limits.
- [x] Docs + CHANGELOG updated.

### M4.2 — graph.syncWith(remote)
- [x] API: `await graph.syncWith(remote, opts?)` where remote is URL string or WarpGraph instance.
- [x] HTTP mode: createSyncRequest → POST → applySyncResponse → materialize if needed.
- [x] Direct peer mode: `otherGraph.processSyncRequest(req)`.
- [x] Retry/backoff with jitter; configurable `{ retries, baseDelayMs, maxDelayMs, timeoutMs }`.
- [x] Status callbacks with stable events and attempt numbers.
- [x] Deterministic behavior (no ordering dependence on wall-clock).
- [x] Tests: HTTP success, direct peer, retries, invalid URL / 4xx no-retry.
- [x] Docs + CHANGELOG updated.

### M4.3 — No-coordination regression suite
- [x] Tests enforce: no merge commits in writer refs after sync cycles.
- [x] Tests enforce: commit path does not read other writers’ heads.
- [x] Fuzz random sync/write interleavings; invariants hold.
- [x] CI coverage + CONTRIBUTING note.

## Milestone 5 — Edge Properties

### M5.1 — EdgePropKey encoding
- [ ] Encode/decode utilities with injective, reversible, deterministic rules.
- [ ] Tests: round-trip, separators, fuzz domain.

### M5.2 — Patch ops for edge properties
- [ ] API: addEdge(props?) and/or setEdgeProperty().
- [ ] LWW semantics; stored in prop map via EdgePropKey.
- [ ] Materialization: getEdge returns props.
- [ ] Tests: add/update, concurrent LWW, determinism.

### M5.3 — Visibility rules
- [ ] Edge props visible iff edge visible.
- [ ] Tests: remove edge hides props; re-add behavior defined.

### M5.4 — Schema v3 + compatibility
- [ ] Schema bump with reader compatibility for v2.
- [ ] Mixed-version sync safety.
- [ ] Tests: v2/v3 load + sync; unsupported schema errors.

## Milestone 6 — Subscriptions / Reactivity

### M6.1 — State diff engine
- [ ] Deterministic diff of materialized states (nodes/edges/props).
- [ ] Tests: expected diff output, determinism, perf sanity.

### M6.2 — graph.subscribe({ handlers })
- [ ] Subscribe/unsubscribe; optional initial replay.
- [ ] Error isolation; onError or aggregated errors.
- [ ] Tests: handler firing + unsubscribe.

### M6.3 — graph.watch(pattern)
- [ ] Pattern-based filtering using glob semantics.
- [ ] Tests: watched node/edge changes only.
