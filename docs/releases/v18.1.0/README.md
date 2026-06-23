# V18.1.0 Release Evidence

Status: pre-tag release evidence packet for the `v18.1.0` release-prep
line. No `v18.1.0` tag has been cut. Tagging still requires explicit operator
approval after the release gate below is complete, merged, and locally green.

Date: 2026-06-23.

## Release Gate

`v18.1.0` must not ship until the reified Optic design cycle is complete.

Gate:

- Issue: https://github.com/git-stunts/git-warp/issues/665
- Design: `docs/design/0275-v18-reified-optics/v18-reified-optics.md`

The release can proceed only when runtime truth, docs, and evidence agree that
`Optic` is no longer taught as a first-class noun without a runtime-backed
domain object behind it. If the final implementation lands a narrower noun than
the canonical model, public docs must mark `Optic` as `transition` and name the
remaining limitation.

## Current Packet Scope

This packet records the release-prep state established before the Optic
reification implementation lands:

- public README accuracy pass;
- focused topic docs for Optics, Observers, and Bounded Reads;
- runnable examples for the same public reading surfaces;
- ESLint configuration repair;
- root npm, JSR, lockfile, and private workspace versions aligned at `18.1.0`;
- `CHANGELOG.md` promoted to a dated `18.1.0` entry;
- hard release gate for the reified Optic runtime noun.

## Version Lockstep

Release metadata must agree on `18.1.0`:

- `package.json`
- `jsr.json`
- `package-lock.json` root package metadata
- private workspace package manifests under `packages/*/package.json`

The executable gate is:

```bash
npm run release:guard -- --tag v18.1.0 --stage prep-pr
```

The final local gate remains stricter because it also requires GitHub release
issue counts, a clean working tree, and final release evidence:

```bash
npm run release:preflight
```

## Issue gates

The final tag gate must have:

- zero open `priority:asap` issues;
- zero open issues in the `v18.1.0` milestone;
- zero open issues in earlier release milestones.

At packet creation time, #665 is intentionally open and labeled
`priority:asap`; that is the hard release blocker for reified Optics.

## Validation

Packet-level validation run during scaffold:

```bash
npx markdownlint-cli CHANGELOG.md \
  docs/design/0275-v18-reified-optics/v18-reified-optics.md \
  docs/releases/v18.1.0/README.md
```

Final validation must append the completed #665 implementation tests, release
guard output, and package preflight output before tagging.

## Deterministic reproducibility

The release remains source-first and Git-backed. Reproducibility depends on:

- append-only graph history;
- lockstep package metadata;
- committed docs and examples;
- committed design evidence for the release-blocking optic cycle;
- rerunnable tests named in the final #665 closeout.

## Goalpost evidence

The active `v18.1.0` goalpost is reified Optics:

- issue #665;
- design `0275-v18-reified-optics`;
- final witness to be appended after implementation and validation land.

## Canonical fixtures and witnesses

Current packet witnesses:

- `examples/optics.ts`
- `examples/observers.ts`
- `examples/bounded-reads.ts`
- `docs/topics/optics.md`
- `docs/topics/observers.md`
- `docs/topics/bounded-reads.md`

Final packet witnesses must include the targeted reified Optic tests added by
#665.

## Documentation Evidence

The public documentation now distinguishes:

- shipped first-use read path: `prepareOpticBasis()`, `coordinate()`, and
  `coordinate().optic()`;
- target runtime noun: first-class `Optic` reification still pending until
  issue #665 lands;
- Continuum posture: git-warp evidence is translated git-warp evidence shaped
  for Continuum unless native Continuum witnesshood is proven separately.

## Documentation review

Release documentation review surface:

- `CHANGELOG.md`
- `README.md`
- `TECHNICAL_TEARDOWN.md`
- `docs/ARCHITECTURE.md`
- `docs/GETTING_STARTED.md`
- `docs/READINGS_AND_OPTICS.md`
- `docs/GUIDE.md`
- `docs/API_REFERENCE.md`
- `docs/CLI_GUIDE.md`
- `docs/PUBLIC_API_COSTS.md`
- `docs/ADVANCED_GUIDE.md`
- `docs/CONCEPTUAL_OVERVIEW.md`
- `docs/migrations/`
- `docs/ROADMAP.md`
- `docs/BEARING.md`

This scaffold records the public README/topic/example accuracy pass. Final
tagging requires the full release documentation surface to remain consistent
with the landed Optic runtime noun.

## Accepted residual risks

Accepted only for this scaffold packet:

- reified Optic implementation is still pending behind #665;
- native Continuum witnesshood remains out of scope;
- release evidence still needs final validation output before tag approval.

## Required Closeout Evidence

Before tagging `v18.1.0`, append the final closeout evidence here:

- issue #665 closed or explicitly superseded;
- implementation commit or PR link;
- targeted optic reification test commands and results;
- docs/glossary status transition;
- final release guard result;
- accepted residual risks, if any.

## Non-Goals

This packet does not claim:

- native Continuum witnesshood;
- remote optic transport;
- a full materialization-plan implementation;
- distributed braid or plural-admission semantics;
- permission to tag before the reified Optic gate is complete.
