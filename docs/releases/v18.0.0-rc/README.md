# V18.0.0 Release Candidate Evidence

Status: release-candidate evidence packet, not a published tag.

Date: 2026-05-24.

## Candidate Scope

The v18 release candidate adds the first complete graph-model migration proof
runway:

- deterministic v17 golden graph-history fixture restore;
- read-only restored source inventory collection;
- pure dry-run graph-model migration planning;
- operation lowering into scratch migration commits;
- scratch equivalence gating against legacy fixture readings;
- production-runtime scratch replay and public-read wet-run proof;
- guarded archive-preserving live finalization behind reviewed JSON
  confirmation;
- generated Continuum runtime-boundary fixture ingestion and graph-model
  conformance;
- first `warp-ttd` generated-family smoke fact for translated git-warp
  evidence;
- executable raw content/property boundary audit with one retired-boundary
  ratchet.

## Evidence

The current branch has these inspectable evidence points:

- `fixtures/v17/graph-model-golden/manifest.json` names the canonical v17
  fixture writer refs, expected heads, patch counts, and visible fact families.
- `scripts/v18.0.0/migrations/graph-model/` contains the dry-run, scratch,
  wet-run, runtime-conformance, finalization, and CLI command path.
- `test/fixtures/continuum/runtime-boundary-family-generated-artifact.json`
  is admitted as generated runtime-boundary contract evidence.
- `GitWarpGraphModelContractConformance` ties the admitted descriptor to the
  v17 graph-model fixture fact families.
- `GitWarpWarpTtdGeneratedFamilySmoke` converts passed conformance into a
  `PRESENT` translated-substrate fact for the `warp-ttd` target.
- `test/unit/scripts/v18-content-property-closeout-audit.test.ts` enforces the
  active raw-boundary list and the retired `CoordinateFactExport.ts` ratchet.

## Go/No-Go

Go for a v18 release candidate PR when these gates are green:

- local unit suite;
- source and test typecheck;
- Markdown lint for the candidate docs and BEARING;
- raw content/property closeout audit;
- GitHub CI on the PR branch.

Do not cut the public v18 tag until these additional release gates pass on the
release-prep branch:

- `npm run lint`;
- `npm run test:coverage`;
- `npm run lint:sludge`;
- `npm run lint:semgrep`;
- `npm run typecheck:consumer`;
- `npm run typecheck:surface`;
- `npm run release:preflight`;
- package version and `jsr.json` version agree;
- `CHANGELOG.md` has the dated v18 entry.

## Residual Risks

- Content persistence still uses legacy `_content*` compatibility properties.
- Raw property-map boundaries remain in reducers, replay, serialization,
  logical index construction, visible-scope filtering, and migration-source
  compatibility.
- Generated Continuum evidence is translated git-warp evidence, not native
  Continuum witnesshood.
- The release candidate packet is not a tag. It is the evidence checkpoint used
  to decide whether to cut the actual release-prep branch.

## Recommendation

Proceed to PR review for the slice-86-through-95 branch after local final
checks pass. Treat the next goalpost as release-prep hardening, not more
feature work, unless CI or review surfaces a blocker.
