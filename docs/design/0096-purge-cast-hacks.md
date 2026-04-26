# 0096 Purge Cast Hacks

- Status: `RED`
- Release lane: `v17.0.0`
- Source backlog: `PROTO_purge-cast-hacks`
- Source manifest: `policy/quarantines/0025A-casts.json`
- Sponsor human: James Ross
- Sponsor agent: Codex

## Hill

`0025A-casts` is graduated: no live `as unknown as` or `as any`
escape-hatch casts remain in `src/**/*.ts`, and
`policy/quarantines/0025A-casts.json` has `files: []`.

## Why This Exists

v17 is the TypeScript rewrite, and the rewrite is not credible while
double-casts remain in core. A double-cast is not a type. It is a typed
lie. It can hide a missing decoder, a missing port method, a runtime
model gap, or a boundary leak that later work depends on seeing clearly.

This is the first remaining 0025 anti-sludge family because
`PROTO_purge-cast-hacks` blocks `PROTO_purge-boundary-leaks`, which
then blocks `PROTO_purge-fake-models`, which then blocks
`PROTO_purge-import-law`.

## Current Evidence

The branch-level quarantine gate currently reports:

| Manifest | Accusations |
|---|---:|
| `0025A-casts` | 13 |
| `0025B-boundary` | 115 |
| `0025C-fake-models` | 12 |
| `0025D-import-law` | 4 |

The current `0025A-casts` manifest has 13 file entries. Current live
double-cast sites are concentrated in 10 of those files; three manifest
entries are already stale.

| File | Live cast sites | Notes |
|---|---:|---|
| `src/domain/WarpGraph.ts` | 0 | stale manifest entry |
| `src/domain/services/ImmutableSnapshot.ts` | 1 | generic clone/freeze trust |
| `src/domain/services/MaterializedViewHelpers.ts` | 1 | storage surface shape |
| `src/domain/services/MaterializedViewService.ts` | 1 | storage surface shape |
| `src/domain/services/TemporalQuery.ts` | 1 | patch lamport projection |
| `src/domain/services/VisibleStateScope.ts` | 1 line / 2 casts | patch ops projection |
| `src/domain/services/controllers/StrandController.ts` | 0 | stale manifest entry |
| `src/domain/services/provenance/BTR.ts` | 2 | BTR field decoding / validation |
| `src/domain/services/provenance/btrOperations.ts` | 2 | provenance JSON bridge |
| `src/domain/services/query/Observer.ts` | 0 | stale manifest entry |
| `src/domain/services/state/checkpointLoad.ts` | 1 | sentinel EventId construction |
| `src/domain/services/sync/HttpSyncServer.ts` | 1 | sync auth raw body bridge |
| `src/domain/stream/WarpStream.ts` | 1 | async iterable capability probe |

The command used for current evidence is intentionally precise:

```sh
rg -n '\bas\s+unknown\s+as\b|\bas\s+any\b' src --glob '*.ts'
```

Plain `rg 'as any'` is too broad because it matches innocent prose such
as "has anything".

## Original Backlog Context

Per the P6.5 contamination map, 33 files in `src/**` used
`as unknown as` at adoption time. Every instance was a runtime lie:
the code told the compiler to stop asking questions about a type it
could not prove.

The original card grouped the work into:

- controller casts
- public entry casts around `WarpGraph` / `WarpRuntime`
- adapters and scattered sites

Current branch work has already removed many of those historical sites.
This cycle owns the remaining live casts and stale manifest entries.

## Playback Questions

### Agent

- Does `policy/quarantines/0025A-casts.json` still exist with
  `files: []`?
- Does the precise cast search return zero live `as unknown as` and
  `as any` escape hatches in `src/**/*.ts`?
- Does `npm run lint:semgrep` pass without reporting unquarantined
  cast violations?
- Does `npm run lint:quarantine-graduate` fail, if it still fails, only
  on non-0025A manifests?
- Can each removed cast be explained as one of: decoder/model
  introduction, narrower type/port, runtime guard, or stale manifest
  cleanup?

### Human

- Is it obvious that the cast-family quarantine is gone rather than
  hidden behind suppressions?
- Is it obvious where the real boundary/model work surfaced while
  deleting casts?
- Is the next blocker (`PROTO_purge-boundary-leaks`) clearer after this
  cycle?

## Accessibility / Assistive Reading Posture

Relevant. The result must be reviewable through plain files and command
output. A future reader should not need chat context to distinguish
"cast removed because the model is honest" from "cast removed because
the manifest was manually edited."

## Localization / Directionality Posture

Low relevance. User-facing strings are not the primary surface. If error
messages change while replacing casts, keep them direct and literal.

## Agent Inspectability / Explainability Posture

High relevance. Agents must be able to inspect:

- the empty 0025A manifest
- the conformance test that fails when casts return
- the exact command used to search for live escape-hatch casts
- the retro's per-site explanation of what replaced each cast

## Non-Goals

- Do not purge `Record<string, unknown>` broadly; that is `0025B`.
- Do not purge `*Like` placeholder types; that is `0025C`.
- Do not purge import-law violations; that is `0025D`.
- Do not add inline suppressions for 0025A.
- Do not replace double-casts with single casts, `any`, `unknown`
  leaks, or shape theater.
- Do not invent fake domain nouns just to satisfy TypeScript.
- Do not run `method init` or depend on METHOD MCP until the METHOD
  repo fixes the signpost-alias bug.

## Design

### 1. Add The Executable Spec

Add `test/conformance/castQuarantineGraduation.test.ts`.

It should assert:

- `policy/quarantines/0025A-casts.json.files` is empty.
- no `\bas\s+unknown\s+as\b` match exists under `src/**/*.ts`.
- no `\bas\s+any\b` match exists under `src/**/*.ts`.

This RED test must fail before code changes because the manifest is not
empty and live double-cast sites remain.

### 2. Remove Stale Manifest Entries

The manifest currently includes stale entries for files that no longer
have live double-casts:

- `src/domain/WarpGraph.ts`
- `src/domain/services/controllers/StrandController.ts`
- `src/domain/services/query/Observer.ts`

These are graduated by manifest cleanup after the conformance test
exists. They do not need suppressions.

### 3. Replace Cast Sites With Runtime-Honest Shapes

Each live site gets the narrowest honest replacement:

- If the value is already validated, encode that validation in a type
  guard or assertion function.
- If the value is boundary/raw data, decode it before it reaches the
  domain behavior.
- If the value is a generic clone/freeze operation, isolate the
  unavoidable unsafeness behind a named concept or remove the fake
  generic promise.
- If the value is standing in for an EventId, BTR fields, patch ops, or
  storage capability, introduce the real constructor/normalizer or reuse
  the existing one.

### 4. Keep 0025B Visible

Some cast removals will expose `Record<string, unknown>` or raw-shape
surfaces. That is acceptable only if the exposed surface is already
tracked by `0025B-boundary`. Do not camouflage boundary debt just to
make 0025A look smaller.

### 5. Empty The Manifest

After all live sites are removed and stale entries are gone, update
`policy/quarantines/0025A-casts.json` to:

```json
"files": []
```

Keep the manifest as historical policy evidence.

## Test Plan

### RED

Run:

```sh
npx vitest run test/conformance/castQuarantineGraduation.test.ts
```

Expected RED:

- fails because `0025A-casts.json.files` is not empty
- fails because live double-cast sites remain

### GREEN

Run:

```sh
npx vitest run test/conformance/castQuarantineGraduation.test.ts
npm run typecheck
npm run lint:semgrep
npm run lint:sludge
npm run lint:quarantine-graduate
git diff --check
```

Also run targeted tests for the changed domains:

- materialized view helpers/service
- temporal query / visible state scope
- provenance BTR and operations
- checkpoint load
- sync HTTP auth server
- WarpStream

### Edge Cases

- `as any` search must not count prose like "has anything".
- Stale manifest entries are removed only after the RED test exists.
- Domain constructors must validate invariants instead of accepting
  shape casts.
- Expected failures remain return values or domain errors, not raw
  `Error`.
- The final `lint:quarantine-graduate` may still fail on `0025B`,
  `0025C`, or `0025D`, but must not include `0025A-casts`.

### Known Failure Modes

- A double-cast is replaced with a single cast: not acceptable.
- A double-cast is replaced with `any`: not acceptable.
- Boundary work is hidden by a helper called `normalizeThing`: not
  acceptable.
- The manifest is emptied without removing live casts: test failure.
- A site actually depends on `0025B` boundary remodeling: either do the
  minimal boundary fix honestly, or document a pivot and file the
  remaining work explicitly.

## RED Witness

Command:

```sh
npx vitest run test/conformance/castQuarantineGraduation.test.ts
```

Result: failed for the intended reasons.

- `policy/quarantines/0025A-casts.json.files` is not empty.
- The AST-based scan found 13 real escape-hatch casts in `src/**/*.ts`.

The test deliberately uses the TypeScript compiler AST rather than a
plain text regex so prose like "has anything" or comment-only wording
does not count as an `as any` cast.
