# V18.0.0 Release Notes

Status: pre-tag public release evidence packet for the `v18.0.0` release-prep
branch. No `v18.0.0` tag has been cut; tagging still requires explicit operator
approval after this packet is merged to `main` and the final guard is green.

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
  existing checkpoint-tail basis evidence instead of materializing the full
  graph;
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
liveRef: refs/warp/v17-golden-graph/writers/alice
archiveRef: refs/warp-migration-archive/v17-golden-graph/writers/alice/release-check
previousLiveHead: 417fe95095a6feae3042c36505065bbd7b3d2a67
archiveHead: 417fe95095a6feae3042c36505065bbd7b3d2a67
finalizedLiveHead: bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
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
- v20 observer/support/index execution semantics;
- v21 distributed braid or plural-admission semantics.

Broader slice-first read execution remains a later-major runway. V18 public
paths are released only with the row-specific cost labels recorded in
`docs/public-api-cost-inventory.tsv`; diagnostic, offline, and legacy surfaces
are not first-use application evidence.

## Issue gates

The pre-tag issue gate is:

- zero open `priority:asap` issues;
- zero open issues in the `v18.0.0` milestone before tag approval;
- zero open issues in earlier release milestones;
- zero open release-blocking debt issues carried in the `v18.0.0` milestone.

At packet update time, every non-release v18 blocker had either been closed with
deterministic evidence or moved out of the release milestone. `#552` is the
final pre-tag closeout issue and exists only to record this packet, the final
guard run, and the no-tag-without-consent posture.

## Goalpost evidence

The release roadmap evidence is organized under `docs/method/roadmap/v18.0.0/`:

- V18-GP1 Optics public API closeout landed with 20 completed slices.
- V18-GP2 bounded-memory large-graph gate landed with 15 completed slices.
- V18-GP3 content attachment-plane honesty landed with 4 completed slices.
- V18-GP4 holographic slicing and checkpoint basis landed with 8 completed
  slices.
- V18-GP5 release operation evidence is this pre-tag packet, the final local
  release guard, and the operator decision to tag or stop.

## Canonical fixtures and witnesses

Canonical fixtures and witnesses for v18 are:

- `fixtures/v17/graph-model-golden/manifest.json`, which names
  `v17-golden-graph-model-001`, graph id `v17-golden-graph`, writer
  `refs/warp/v17-golden-graph/writers/alice` at
  `417fe95095a6feae3042c36505065bbd7b3d2a67`, and writer
  `refs/warp/v17-golden-graph/writers/bob` at
  `d7c3a05b3894d5c3c151e03dd972b6bd6c341b0c`;
- `fixtures/v17/graph-model-golden/v17-golden-graph.bundle`, the restoreable
  Git fixture used by the migration wet-run harness;
- `test/conformance/fixtures/V18LargeGraphOverSmallPoolFixture.ts`, the
  large-graph-over-small-pool bounded-memory fixture;
- `test/conformance/v18BoundedMemoryLargeGraphGate.test.ts`, the public-path
  large-graph conformance witness;
- `test/conformance/post-v17/graphQueryBoundedProvider.blocked.test.ts`, the
  exact-id checkpoint-tail query witness;
- `test/unit/scripts/v18-content-property-closeout-audit.test.ts`, the residual
  raw content/property boundary audit.

## Documentation review

The release documentation review covers:

- `CHANGELOG.md`;
- `README.md`;
- `TECHNICAL_TEARDOWN.md`;
- `docs/ARCHITECTURE.md`;
- `docs/GETTING_STARTED.md`;
- `docs/READINGS_AND_OPTICS.md`;
- `docs/GUIDE.md`;
- `docs/API_REFERENCE.md`;
- `docs/CLI_GUIDE.md`;
- `docs/PUBLIC_API_COSTS.md`;
- `docs/ADVANCED_GUIDE.md`;
- `docs/CONCEPTUAL_OVERVIEW.md`;
- `docs/migrations/`;
- `docs/ROADMAP.md`;
- `docs/BEARING.md`.

The review contract is semantic, not only structural: docs must not claim native
Continuum witnesshood, global boundedness for diagnostic APIs, or total raw
storage-plane retirement.

## Deterministic reproducibility

Deterministic reproducibility requires canonical fixtures and command witnesses
instead of memory-only claims. The release gate evidence must be reproducible
from committed files, GitHub issue comments, CI logs, and local commands. Any
claim that depends on runtime behavior must cite a test, fixture, generated
artifact, report, or command output.

## Validation

Pre-tag validation is:

```bash
npm run release:preflight
npm run release:guard -- --tag v18.0.0 --stage final-local
```

The final guard must be run from `origin/main` after the release closeout PR is
merged. It must pass version lockstep, clean tree, origin-main, changelog,
release evidence, GitHub issue, and prior-release gates before requesting tag
approval.

## Accepted residual risks

Accepted residual risks for `v18.0.0` are:

- raw content/property compatibility boundaries remain named and guarded by the
  closeout audit;
- full-result graph helpers, full materialization, and legacy facades remain
  available for diagnostic, offline, migration, or compatibility use, not
  first-use application examples;
- native Continuum witnesshood, Echo parity, and distributed braid semantics
  remain later-release work.

## Release Gates

Before tagging, run:

```bash
npm run release:preflight
```

The release-prep branch must also pass GitHub CI after PR review. Tag only from
merged `main`, after package metadata, JSR metadata, lockfile, and changelog
all agree on `18.0.0`.
