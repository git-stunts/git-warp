# V18.0.0 Release Notes

Status: public release notes for the `v18.0.0` release-prep branch.

Date: 2026-05-25.

## Release Scope

`v18.0.0` is the graph-model convergence release. It makes the v18 migration
path inspectable and guarded without pretending that `git-warp` has become a
different runtime.

This release adds:

- a Worldline-first public application entry point with `openWarpWorldline()`,
  `WarpWorldline`, `WarpWorldlineOpenOptions`, and
  `WarpWorldlinePatchBuild`;
- coordinate-backed Optics through `prepareOpticBasis()`, `coordinate()`, and
  `coordinate.optic()` so users can run coherent public node and property optic
  reads without opening graph/materialize-first APIs, with setup verifying
  existing bounded basis evidence instead of materializing the full graph;
- docs and migration guidance that classify `openWarpGraph()`, `WarpApp`,
  `WarpCore`, and materialize-named methods as compatibility, diagnostic,
  migration, or substrate tooling surfaces instead of first-use app APIs;
- runtime-backed graph-model records for nodes, edges, attachments, content,
  node properties, and edge properties;
- projection-backed compatibility reads for legacy content and property state;
- a dry-run graph-model migration planner and deterministic manifest adapter;
- restored v17 golden graph-history fixtures;
- scratch migration writing under `refs/warp-migration-scratch/*`;
- genesis-equivalence gating between legacy and migrated readings;
- production-runtime scratch replay for the canonical wet-run path;
- deterministic operator reports;
- guarded archive-preserving finalization behind reviewed JSON confirmation;
- generated Continuum runtime-boundary contract evidence;
- a first `warp-ttd` generated-family smoke fact.

`git-warp` remains an independent Continuum participant. Continuum is the
protocol for exchanging witnessed causal history. Echo and `git-warp` are
sibling participants, not halves of one runtime.

## Operator Path

### 1. Run dry-run planning

Use the dry-run entry point to validate request JSON and produce deterministic
planning evidence before writing scratch history:

```bash
node scripts/v18.0.0/migrations/graph-model/dry-run.ts \
  --request ./migration-request.json \
  --manifest-out ./v18-migration-manifest.json
```

The dry run must complete without fatal migration notices before continuing.

### 2. Write scratch history and report evidence

Use the command wrapper to write lowered migration operations only under a
scratch ref:

```bash
node scripts/v18.0.0/migrations/graph-model/migrate.ts \
  --repo ./restored-v17-repo \
  --request ./migration-request.json \
  --legacy-fixture-manifest ./fixtures/v17/graph-model-golden/manifest.json \
  --scratch-ref refs/warp-migration-scratch/v17-golden-graph/release-check \
  --report-out ./v18-migration-report.txt
```

The command report includes dry-run, lowering, scratch, equivalence, and
finalization sections. Without a finalization request, finalization is skipped.

### 3. Review equivalence and runtime replay

Before any live ref moves, the operator report must show:

```text
dryRun: passed
lowering: passed
scratch: written
equivalence: passed
mismatches: 0
```

For the canonical v17 fixture path, the wet-run harness also proves migrated
scratch operations can replay through the production runtime write and
materialization path.

### 4. Finalize only with reviewed JSON

Direct finalization flags are intentionally refused. Finalization must use a
reviewed JSON request:

```bash
node scripts/v18.0.0/migrations/graph-model/migrate.ts \
  --repo ./restored-v17-repo \
  --request ./migration-request.json \
  --legacy-fixture-manifest ./fixtures/v17/graph-model-golden/manifest.json \
  --scratch-ref refs/warp-migration-scratch/v17-golden-graph/release-check \
  --finalization-request ./finalization-request.json \
  --report-out ./v18-finalization-report.txt
```

The reviewed finalization request must match the observed scratch ref, scratch
head, equivalence evidence, runtime witness, live-ref expected head, archive
ref, and confirmation token. Stale or edited evidence blocks finalization.

### 5. Preserve archive evidence

Successful finalization preserves old live lineage under an archive ref before
advancing the live ref. The report prints:

```text
liveRef: refs/warp/<graph>/...
archiveRef: refs/warp-migration-archive/<graph>/...
previousLiveHead: <old-head>
archiveHead: <old-head>
finalizedLiveHead: <scratch-head>
archivePreserved: yes
```

Rollback is an operator action, not an automatic background behavior. The
archive ref is the evidence needed to inspect or restore the previous lineage.

## Accepted Residual Risk

`v18.0.0` still carries named legacy raw content/property compatibility
boundaries. The release does not claim total storage-plane retirement.

The guard is executable:

```bash
npm exec vitest run test/unit/scripts/v18-content-property-closeout-audit.test.ts
```

That audit enumerates the remaining raw compatibility files and keeps retired
raw-boundary classes from returning silently.

## Non-Goals

`v18.0.0` does not provide:

- full native Continuum witnesshood;
- Echo runtime parity;
- a full Continuum admission shell;
- total raw content/property storage retirement;
- release of the bounded-memory large-graph product gate before its conformance
  witness lands;
- v20 observer/support/index execution semantics;
- v21 distributed braid or plural-admission semantics.

Broader slice-first read execution remains a later-major runway, but v18 itself
is blocked until normal public reads, writes, content lookup, and sync pass the
bounded-memory large-graph product gate.

## Release Gates

Before tagging, run:

```bash
npm run release:preflight
```

The release-prep branch must also pass GitHub CI after PR review. Tag only from
merged `main`, after package metadata, JSR metadata, lockfile, and changelog
all agree on `18.0.0`.
