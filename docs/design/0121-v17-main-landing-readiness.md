# 0121 v17 Main Landing Readiness

- Status: `integration readiness report`
- Release lane: `v17.0.0`
- Design role: define the `release/v17.0.0 -> main` landing gate
- Review audience: maintainers and future agents

## Hill

Decide what must be true before `release/v17.0.0` is promoted to `main`.

This is not another optic implementation cycle. The branch is large enough
that the next risk is landing discipline, not missing runtime polish.

## Snapshot

Captured after fetching `origin main release/v17.0.0`.

| Fact | Value |
| --- | --- |
| Local branch | `release/v17.0.0` |
| Local HEAD at snapshot | `069fb6d3 test(optics): pin non-index checkpoint basis context` |
| Remote release ref | `origin/release/v17.0.0 = 312e09ef` |
| Merge base with `origin/main` | `51c173845965` |
| `origin/main...HEAD` | `0 behind / 722 ahead` |
| `origin/release/v17.0.0...HEAD` | `0 behind / 1 ahead` |
| `package.json` / `jsr.json` | `17.0.0 / 17.0.0` |
| `CHANGELOG.md` | dated `[17.0.0]` entry for `2026-04-14` exists |
| Tracked `.js` files | `0` |
| Tracked `.ts` files | `1075` |

Interpretation: this is not a small release branch. It is the accumulated
v17 trunk candidate. `origin/main` is an ancestor, so the shape is linear, not
diverged.

## Change Footprint

The range is:

```text
origin/main..HEAD
```

Observed footprint:

| Measurement | Value |
| --- | --- |
| Commits | `722` |
| Files changed | `2697` |
| Insertions | `268496` |
| Deletions | `205077` |

Git skipped exhaustive rename detection while producing the range stat because
the diff is too large. That is review-relevant: file-level review needs scoped
queries, not one giant diff pass.

Top changed roots:

| Root | Changed paths |
| --- | ---: |
| `test/` | `939` |
| `docs/` | `814` |
| `src/` | `769` |
| `bin/` | `88` |
| `scripts/` | `36` |
| `packages/` | `9` |
| `policy/` | `8` |

File extension shape:

| Extension | Changed paths |
| --- | ---: |
| `.ts` | `1075` |
| `.md` | `818` |
| `.js` | `759` |
| `.json` | `22` |
| `.yml` | `5` |

Most `.js` entries are deletions or migrations in the range; no tracked `.js`
files remain at the snapshot.

## Commit Themes

Commit subject counts by conventional prefix:

| Prefix | Count |
| --- | ---: |
| `docs` | `327` |
| `refactor` | `156` |
| `feat` | `72` |
| `test` | `67` |
| `fix` | `58` |
| `chore` | `20` |
| `policy` | `6` |
| other / historical | `16` |

The first commits after `main` start the TypeScript/SSTS migration:

```text
7745481f chore: Phase 0 scaffolding - prepare toolchain for .ts coexistence
2eaff9c3 refactor: convert error classes from JSDoc-annotated JS to TypeScript
120f9168 feat: convert src/domain/errors/ to TypeScript (28 files)
3f75741a feat: convert src/domain/types/ to TypeScript (35 files)
```

The tail of the branch is the v17 optic foundation and structured failure
work:

```text
a10a8533 feat(optics): implement checkpoint-tail read basis
6e511b05 refactor(optics): split checkpoint tail witness locator
c66aace0 refactor(optics): tighten read failure context lookup
857fd36d feat(optics): add tail budget failure context
890e1ec7 feat(optics): add checkpoint shard failure context
c521621e refactor(optics): formalize read failure context schema
312e09ef test(optics): pin missing index shard basis context
069fb6d3 test(optics): pin non-index checkpoint basis context
```

## What v17 Guarantees Now

These are concrete properties backed by code, tests, or branch inspection.

| Guarantee | Evidence |
| --- | --- |
| Source is TypeScript-first | `git ls-files '*.js'` returns `0`; `git ls-files '*.ts'` returns `1075`. |
| Package metadata agrees on v17 | `package.json` and `jsr.json` both report `17.0.0`. |
| Dated v17 changelog entry exists | `CHANGELOG.md` contains a `[17.0.0]` entry dated `2026-04-14`. |
| Public node optic read exists | `worldline.optic().node(id).read()` conformance. |
| Public node property optic read exists | `worldline.optic().node(id).prop(key).read()` conformance. |
| Optic reads use checkpoint-tail basis | `CheckpointTailBasisLoader`, `CheckpointShardFactReader`, `CheckpointTailFactReducer`, and `CheckpointTailReadIdentityBuilder`. |
| Optic path does not read `state.cbor` | No `state.cbor` match under `src/domain/services/optic`. |
| Optic path has no materialization fallback | No `_materializeGraph`, `materialize(`, or `_loadLatestCheckpoint` match under `src/domain/services/optic`. |
| Structured optic failure context exists | `OpticReadFailureContext` schema and focused unit/conformance tests. |
| Known fail-closed optic boundaries are pinned | Missing basis, non-index checkpoint, missing index shards, empty payload pointer, shard unavailable/invalid, tail budget, tail `NodeRemove`, unsupported tail property value. |
| Recovery names are documented | `0117-v17-plumber-recovery-contract.md`. |
| Error, budget, and reducer contracts are documented | `0118`, `0119`, and `0120` design docs. |

## Landing Checklist

`v17.0.0` may be promoted to `main` only when every blocking row is true.

| Gate | Current state | Blocking? |
| --- | --- | --- |
| `release/v17.0.0` is clean | true at snapshot | yes |
| `release/v17.0.0` is synced to `origin/release/v17.0.0` | false; local is ahead by `1` before this report commit | yes |
| `origin/main` is an ancestor of the release branch | true | yes |
| Full local preflight has run on the final candidate | false for this snapshot | yes |
| PR from `release/v17.0.0` to `main` has green CI | false; no PR run yet | yes |
| Release branch push expectation is understood | true; release branch pushes do not trigger CI | yes |
| `CHANGELOG.md` has a dated v17 entry | true | yes |
| `package.json` and `jsr.json` versions match | true | yes |
| No release tag has been created early | true | yes |
| No release artifact has been produced early | true | yes |

This report does not approve tagging. Tagging is a separate release step after
the `main` landing and release preflight.

## CI Reality

Current workflow triggers:

| Workflow | Trigger that matters |
| --- | --- |
| `CI` | push to `main`, PR to `main`, version tags |
| `Link Check` | markdown changes on push/PR to `main` |
| `Release Preflight (PR)` | PR to `main` |
| `Release` | version tags only |
| `Tag Guard` | all tags |

Pushing `release/v17.0.0` by itself does not exercise the normal `main` or PR
workflow gates. The branch needs a PR to `main` or an intentional protected
main update to get GitHub validation.

## Required Local Gates Before PR

Run these on the final candidate commit:

```sh
npm run release:preflight
```

If preflight is too slow or fails in a way that needs triage, split the result
into the explicit gates from `scripts/release-preflight.sh`:

```sh
npm run lint
npm run typecheck:src
npm run typecheck:policy
npm run typecheck:consumer
npm run typecheck:surface
npm run test:coverage
npm pack --dry-run
npx -y jsr publish --dry-run --allow-dirty
npm audit --omit=dev --audit-level=high
```

The branch warning from preflight is acceptable before the PR because the run is
not on `main`. Hard failures are not acceptable.

## Recommended Landing Mechanism

Use a normal PR from `release/v17.0.0` to `main`.

Allowed landing shapes:

- GitHub merge commit after green PR CI.
- Fast-forward main to the release branch, if maintainers intentionally choose
  that policy and all protected gates are green.

Do not use:

- rebase
- force push
- squash by reflex
- tag before `main` is green
- release artifact before tag validation

The branch contains cycle history. Squashing would discard useful review and
audit structure unless a human explicitly decides that tradeoff is worth it.

## Known Non-Blocking Gaps

These do not block v17 as a foundation release:

- Full reducer support for tail `NodeRemove`.
- Tail object/array parser widening.
- `maxTailBytes` runtime behavior.
- `maxTailMs` runtime behavior.
- Public Plumber recovery implementation.
- Edge, neighbor, attachment, or recursive optic families.
- Removing every explicit legacy materialization API.

They are deferred because v17 is shipping the bounded optic foundation and
contracts, not the full Continuum surface.

## Known Risks

Real risks to manage before landing:

| Risk | Mitigation |
| --- | --- |
| The PR is too large for ordinary review. | Review by range themes and required gates; do not pretend one giant diff review is meaningful. |
| Branch pushes do not run CI. | Open PR to `main` and require green workflows there. |
| Local release branch is ahead of remote. | Push only after explicit approval. |
| Full release preflight has not run on the final candidate. | Run it before requesting main landing. |
| `docs/BEARING.md` is stale about branch-ahead counts. | Refresh signposts at the next cycle boundary or release closeout, not by ad hoc midstream edits. |
| Existing explicit materialization APIs remain outside the optic path. | Keep v17 claim precise: optic reads are bounded; legacy materialization surfaces are not removed in v17. |

## Playback Questions

- Can a maintainer see whether `release/v17.0.0` is linear with `main`?
- Can a maintainer see why this is a trunk promotion rather than a small patch?
- Can a maintainer list the blocking gates before landing?
- Can a maintainer explain why pushing the release branch is not enough for CI?
- Can a future agent avoid adding more runtime work before the landing gate is
  settled?

## Decision

Stop feature work until the landing gate is owned.

Next safe actions, in order:

1. Decide whether to push the current local release branch commits.
2. Run local preflight on the final candidate.
3. Open a PR from `release/v17.0.0` to `main`.
4. Let GitHub Actions validate the PR.
5. Land by normal merge or intentional fast-forward only after green gates.
