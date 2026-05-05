# BEARING

Updated at cycle boundaries. Not mid-cycle.

Scope note:

- `BEARING` says where the repo stands now, what feels wrong now, and what is
  next.
- For canonical noun meanings, use [GLOSSARY.md](GLOSSARY.md).
- For the runtime architecture ladder, use
  [0035-observer-geometry-architecture-ladder.md](design/0035-observer-geometry-architecture-ladder.md).
- For later-major horizon planning, use
  [release-horizon-v20-v21.md](design/release-horizon-v20-v21.md).

## Where are we

`git-warp` is executing the v17 release-blocker DAG. The current work is
not a broad RuntimeHost rewrite; it is one bounded release blocker at a
time, with the DAG status and SVG kept current after each completed
cycle.

Current branch state at this boundary:

- Branch: `release/v17.0.0`
- Push state: local branch remains ahead of `origin/release/v17.0.0`;
  push only after explicit approval.
- DAG map:
  [0124-v17-release-blocker-dag.md](design/0124-v17-release-blocker-dag.md)
- Latest closed cycle:
  `0144-release-preflight-and-rc`
- Latest full unit gate shape:
  `npm run test:local` is green with `438` files and `6771` tests.
- Latest validation shape:
  lint, anti-sludge shell checks, source/test typecheck, consumer
  typecheck, markdown lint, markdown code-sample lint, high-level npm
  audit, release preflight, and whitespace diff checks are green at this
  boundary.

The current release ladder remains:

- `v17.0.0`: TypeScript migration, public API honesty,
  materialization-frontdoor deletion, readings/optics direction, and
  query read-model groundwork
- `v18.0.0`: graph substrate convergence
- `v19.0.0`: observation, doctrine, and slice-first runtime convergence
- `v20.0.0`: slice-first read execution
- `v21.0.0`: distributed observer geometry and admission reality

Recent work narrowed v17 honestly, removed public materialization
frontdoor docs, fixed runtime read guidance, made checkpoint schema `5`
the single runtime checkpoint contract, removed the checkpoint, patch,
subscription, and sync controller private materialization dependencies,
retired stale materialize-spy expectations, pinned default observer
readings, and aligned remaining checkpoint/materialize unit tests with
the current checkpoint contract, and replaced plain sync HMAC credential
flow with an opaque `SyncSecret`. The sync server now fails closed for
non-local unauthenticated serving and requires an explicit unsafe option
for unauthenticated localhost serving. It also applies per-key token-bucket
rate limiting for configured sync auth and requires an explicit rate-limit
budget for non-local enforced sync auth. The package upgrade command now has
a real checkpoint upgrade path for retired checkpoint envelopes. Unexpected
HTTP sync `500` responses are now sanitized to `E_SYNC_INTERNAL`, with
internal details kept in structured logs.

The runtime is still partially state-first in important places. The
important current truth is narrow: the non-security `test:local` blockers
from the v17 materialization cleanup and the direct sync security hardening
nodes are closed. File-level anti-sludge quarantines are also graduated, and
the full gate matrix is green, and the release cut/version/changelog node is
closed. Final local release preflight is also green. The remaining blocker is
release coordination: push, PR, review, green CI, and an explicit merge
decision.

## Invariants

Compact list here; full derivations with paper grounding, codebase
mapping, and concrete checks live in `docs/invariants/`.

1. **TICK-CONFLUENCE** — same patches, any order, same materialized state
   (Paper II Thm 5.1, OG-4 Thm 10) → `tick-confluence.md`
2. **HOLOGRAPHIC-BOUNDARY** — initial state + patch chains = complete replay,
   no ambient state (Paper III Thm 4.1) → `holographic-boundary.md`
3. **BACKWARD-PROVENANCE** — every value traces to exactly one producing
   patch (Paper III Thm 4.2) → `backward-provenance-completeness.md`
4. **PAYLOAD-MONOID** — checkpoint + remaining patches = full replay
   (Paper III Prop 3.2) → `payload-monoid.md`
5. **STATE-PROVENANCE-SEP** — state convergence does not imply history
   convergence (OG-4 Prop 13, OG-1 Thm 91) → `state-provenance-separation.md`
6. **EXPLICIT-CONFLICT** — conflicts are surfaced, never silently erased
   (OG-4 Thm 15) → `explicit-conflict-surfacing.md`
7. **APPEND-ONLY** — Git history never rewritten
   (Paper III Def 3.6) → `append-only-history.md`
8. **DOMAIN-PURITY** — domain never imports infrastructure or ambient state
   (Paper III Rmk 3.4) → `domain-purity.md`
9. **WRITER-ISOLATION** — each writer owns its own ref, no coordination
   (Paper II Thm 7.1, OG-4 Thm 10) → `writer-isolation.md`
10. **TWO-PLANE-COMMUTATION** — property and topology ops commute
    (Paper II Thm 7.1) → `two-plane-commutation.md`
11. **CAS-ATOMICITY** — writer ref updates are compare-and-swap
    (Paper II Rmk 4.3) → `cas-atomicity.md`
12. **OBSERVER-DETERMINISM** — queries and traversals are deterministic
    functions of state (Paper IV Def 3.1) → `observer-projection-determinism.md`
13. **TRAVERSAL-TRUTH** — streams for traversal, ports for truth
    (OG-1 Def 3, Paper IV Sec 3.3) → `traversal-truth.md`
14. **NO-SCALARIZATION** — observer comparison is multi-dimensional
    (OG-1 Thm 87) → `no-scalarization.md`
15. **SUFFIX-TRANSPORT** — sync at tip, not replay from frontier
    (OG-4 Thm 9) → `suffix-transport-correctness.md`

## What just shipped

Cycles `0132-subscription-controller-reading-basis` through
`0144-release-preflight-and-rc`:

- Removed `_materializeGraph()` from subscription/watch and sync
  controller read paths.
- Made default sync metadata-only unless callers explicitly request
  `materialize: true`.
- Rewrote stale auto-materialize and materialize-spy tests around the v17
  reading-basis contract.
- Pinned default `graph.observer()` reads to the caller's fresh reading
  basis.
- Aligned remaining checkpoint/materialize tests with schema `5` or
  explicit retired-schema upgrade rejection.
- Added `SyncSecret` so sync auth secrets redact in string, JSON, and
  inspect output while still signing HMAC requests.
- Hardened sync serve defaults: non-local bind hosts require enforced
  auth, and local unauthenticated serving must opt into unsafe localhost
  mode.
- Added per-key token-bucket sync auth rate limiting and required explicit
  `auth.rateLimit` for non-local enforced sync hosts.
- Sanitized unexpected HTTP sync `500` responses and routed internal error
  detail through `LoggerPort`.
- Graduated the anti-sludge file-level quarantine manifests to empty
  `files` lists and narrowed remaining legacy hits to owning-cycle inline
  suppressions.
- Recorded the full gate matrix green after quarantine graduation.
- Cut the v17.0.0 changelog section for May 5 and aligned the release note with
  the honest 0123 bounded-query scope.
- Cleared the local release preflight from a clean commit. The hard preflight
  repairs landed in `bdafca51`, and the final preflight reports all hard checks
  passed.
- Brought `npm run test:local` back to green.
- Marked `PORT_subscription-controller-reading-basis`,
  `PORT_sync-controller-reading-basis`,
  `SPEC_materialize-spy-test-clusters`,
  `SPEC_observer-coordinate-pinning`, and
  `SPEC_checkpoint-materialize-test-drift` complete in the DAG, then
  marked `HEX_sync-secret-plain-string` and
  `HEX_sync-production-auth-defaults` complete, then marked
  `HEX_sync-no-rate-limiting`, `HEX_sync-500-sanitization`, and
  `REL_quarantine-graduate-clean`, then
  `REL_full-gate-matrix-green`, then
  `REL_release-cut-version-changelog`, then
  `REL_release-preflight-and-rc` complete.

## What feels wrong

- v17 is still not releasable until the branch is pushed, reviewed, green in
  CI, and explicitly approved for merge.
- `REL_push-pr-review-merge` is now the open node.
- The release preflight fix lowered the coverage ratchet to the measured
  full-suite v17 line baseline `91.74%`; this is tracked as v19 bad-code debt
  in `SPEC_coverage-ratchet-baseline-drop.md`.
- Broader historical version-suffixed substrate names still exist in
  `src/`; the checkpoint upgrade slice removed the touched checkpoint and
  migration names only.
- The branch remains local-only relative to origin; pushing is a separate
  release/coordination decision.

## What comes next

Continue executing the DAG one open node at a time.

Recommended next pull:

- `REL_push-pr-review-merge`

Why:

- It is open.
- The full gate matrix, release cut, and local preflight are green.
- The branch is still local-only relative to origin.
- Merge must remain gated on review, green CI, and explicit human approval.

Keep the loop strict: write the cycle doc, capture RED, green the slice,
update changelog/DAG/SVG/retro, validate, commit, then pull the next open
node.
