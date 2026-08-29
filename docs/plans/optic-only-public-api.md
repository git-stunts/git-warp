# Plan: Optic-only public API — reads self-establish their aperture-scoped basis

Status: **Proposed** (local review; tracking issue pending)
Area: `area:api` / `area:query` / `area:runtime`
Relates to: [Optic reads](../topics/optic-reads.md), [WARP state-cache materialization](../topics/cas-first-memoized-materialization.md), [Unmaterialized intents](../topics/unmaterialized-intents.md), [Readings & Optics §10–§11](../READINGS_AND_OPTICS.md)

## Summary

Finish the transition already begun in `optic-reads.md` and `cas-first-memoized-materialization.md`: make **optics the exclusive public read/write surface**, and make a bounded read **establish its own aperture-scoped basis transparently** — through the git-cas-backed materialization cache that already exists — instead of failing closed when no checkpoint has been published yet. Whole-state materialization leaves the public surface entirely; it becomes an *emergent* result of an extremely wide aperture or an exhaustive traversal, never a named public operation. Everything on the read path streams.

This is a completion, not a rewrite. The substrate (bounded handle-first reads, the coordinate-keyed persistent cache, the Edict intent write model) is already shipped. The gap is that the **public** optic read path does not use it: it verifies a pre-existing checkpoint and fails closed.

## Motivation

A caller who writes a handful of intents on a fresh lane and immediately reads them back through the public optic API gets `E_OPTIC_NO_BOUNDED_BASIS`. There is no in-process, non-forking way to make that read succeed: the only paths that *create* a basis are (a) the fork/strand optic-basis path (a fork is a real causal object — never fork to read), (b) the auto-checkpoint policy, which fires only inside `_onMaterialized` every `{ every: 64 }` patches and **not on the bounded read path**, or (c) the out-of-process CLI `git warp repair --action materialization`. Downstream consumers (e.g. the `dojo` workcell) have compensated in userland by shelling out to the CLI — which is the workaround this plan removes the need for.

`READINGS_AND_OPTICS.md` §10 already names this failure mode precisely:

> make sure the trigger fires on the actual read path your application uses. The Think outage … was a policy whose trigger (`_onMaterialized`) was never called by the lane/bounded-reader path Think actually took. A checkpoint that never fires is … decoration on the one-way door.

## Current state (what is already true)

- **Optics are the intended bounded-read model.** `optic-reads.md` classifies whole-state materialization as **Diagnostic** (inspection/repair/migration only) and exact id-only reads as **Bounded**.
- **The persistent cache exists and is portized.** `WarpStateCachePort` + `MaterializationStorePort` + git-cas `CacheSet` provide coordinate-keyed, evictable retained materializations. git-cas "does not know about WARP frontiers, optics, checkpoints"; git-warp owns those semantics. (`cas-first-memoized-materialization.md`.)
- **The low-level read path is already bounded and self-sufficient.** `resolveLiveMaterialization()` and `RuntimeHost.hasNode()/getNodeProps()/getEdgeProps()` serve exact reads handle-first; a **cold** node/edge-property read "reduces only matching `NodePropSet` operations … does not hydrate `WarpState`." No checkpoint is required for these.
- **`Runtime` exposes no public `materialize()`/`createCheckpoint()`.** Its methods are `open`, `writer`, `lane`, `fork`, `strand`, `previewSettlement`, `settle`, `close`. Materialize/checkpoint are internal to `RuntimeHost`/`WarpGraph`.
- **The debugger/graph-shape surface is already observer-based.** `charts.ts` — "Charts are derived views over a Lane … each builder returns a validated `Observer`."
- **The write model is Edict.** An intent is a deterministic atomic graph rewrite; Edict exists to forbid arbitrary user code (RNG/wall-clock ⇒ non-determinism). In the sibling `echo` repo, edict source compiles to law packs (`echo-edict-canonical` → `-lowerer` → `-verifier`) executed on a runtime adapter; git-warp shares the model so one edict program can target either runtime. Canonical writes lower through `Lane.write(intent)`.

## The gap (what this plan changes)

1. **Public optic reads verify, but do not establish, a basis.** `captureCoordinate(lane)` → `prepareOpticBasis()` → `CheckpointTailBasisVerifier.verify()` throws `E_OPTIC_NO_BOUNDED_BASIS` when no checkpoint is published. The bounded read path never triggers the cache-publishing materialization, so a fresh lane can never be read in-process.
2. **The cache publishes only on the `materialize()` compatibility path**, not on the bounded read path — so the "next equivalent read hits the cache" promise never gets a first write on the read path §10 warns about.
3. **Whole-state materialization is still reachable** (Diagnostic) and neighborhood/traversal/list reads still "own process-resident whole state" (`cas-first-memoized-materialization.md`, Current Limitations).
4. **The "checkpoint" vocabulary leaks into public provenance types** (`E_OPTIC_NO_BOUNDED_BASIS`, `ReadIdentity` witness in `diagnostics.ts`), exposing an internal cache mechanism callers should not need to know about.

## Decision

- **The optic is the sole public read handle, and it carries its own observer geometry.** `lane.optic()` returns a bounded optic at the **live frontier** by default; reading the past means widening/moving the optic's aperture. `WorldlineOptic` already holds the full geometry — coordinate posture, aperture posture, basis posture, evidence posture, and a per-read support rule — so a standalone position object is redundant. `WarpWorldlineCoordinate` and `captureCoordinate()` are therefore **removed from the public surface** (their "pinned vs. live" distinction is just the optic's coordinate posture). A caller never names a checkpoint, a coordinate, or the graph. The **frontier** remains real but lives inside the optic's live-aperture basis (internal), which is where the `Frontier`/`WriterId`/`PatchSha` value-type hardening belongs — not on a public coordinate.
- **A public optic read establishes its own aperture-scoped basis.** On a basis miss, the bounded read path performs the documented `checkpoint/frontier replay → publish snapshot` fallback **scoped to the optic's support rule** (exact entity / neighborhood / global-discovery), publishes the retained materialization to the persistent cache, and returns the reading. A later equivalent read hits the cache. `E_OPTIC_NO_BOUNDED_BASIS` is no longer raised for "no checkpoint yet"; it is reserved for genuinely unbounded requests (global-discovery support with no admissible aperture). Ordinary absence stays data (`exists: false`, `alive: false`).
- **Caching is transparent.** Through the optic read/write API a caller cannot tell whether a read was served from cache or freshly materialized. "Checkpoint" stops being a caller-facing concept; it is one internal cache basis among others.
- **No public materialization API.** Remove whole-state materialization from every public surface (`index`, `advanced`, `charts`, `diagnostics`, `testing`). Internal materialization is scoped strictly to the optic aperture. Full materialization is reachable only by explicitly widening the aperture or traversing exhaustively — never as a named operation.
- **Streaming end-to-end.** No public read returns a whole-state object; all reads stream over a sharded/paged basis (graphs can exceed runtime memory; a full materialization is disk-bound, not memory-bound).
- **The debugger uses optics only.** Graph-shape reads remain observer/chart based (already true); no debugger path may take a whole-state shortcut.

## Slices (dependency order)

1. **The optic-only read handle + RED.** Add `lane.optic()` returning a live-frontier optic; the failing integration test writes a few intents on a fresh lane then `lane.optic().node().prop().read()` must return the written value. Fails today with `E_OPTIC_NO_BOUNDED_BASIS`.
2. **GREEN: route the bounded read path through the handle-first self-establishing basis.** Make the live optic read publish an aperture-scoped retained materialization on a basis miss (the already-shipped `RuntimeHost` cold-read capability), instead of `verify`-only. Cache-transparent.
2b. **Remove `WarpWorldlineCoordinate` + `captureCoordinate` from the public surface** once `lane.optic()` covers the live-read case and aperture adjustment covers the pinned/historic case. Breaking change (major bump).
3. **Extend bounded reads to neighborhood/traversal/list** over the sharded basis, removing their whole-state fallback.
4. **Remove whole-state materialization from public surfaces**; make internal materialization aperture-scoped only; ensure no non-streaming public read remains.
5. **Retire caller-facing "checkpoint" vocabulary** in favor of a neutral read-identity/cache-basis witness; keep the internal mechanism.
6. **Rewire `dojo`** onto the new surface; delete its CLI-`repair` fold and any fork-to-read.

## Test strategy

Per `docs/topics/*` cost-posture discipline and the repo testing standard: each slice names the narrowest contract, demonstrates RED for the intended reason, controls every observed input via the real-Git harness (`createRuntimeHarness` / `createTestRepo`), and declares its blind spots. No mocking of the substrate; use the disposable real-Git repository so tests exercise the production composition boundary. Slice 1's oracle is the written value round-tripping through the public optic read with a completed posture.

## Non-goals

- Changing the Edict intent/write semantics or the CRDT substrate.
- Changing git-cas encapsulation (the cache stays behind `WarpStateCachePort`/`MaterializationStorePort`).
- Migrating retained-materialization descriptor schemas.

## References

- `docs/topics/optic-reads.md` — bounded read model; whole-state = Diagnostic; support rules; "support-fragment cache storage … remain future work".
- `docs/topics/cas-first-memoized-materialization.md` — the persistent cache; `resolveLiveMaterialization()`; handle-first cold reads that avoid whole-state.
- `docs/topics/unmaterialized-intents.md` — the Edict intent model; canonical writes via `Lane.write(intent)`.
- `docs/READINGS_AND_OPTICS.md` §10–§11 — checkpoints as replay-tail bound; the "trigger never fires on the read path" failure mode; write-path affordances.
