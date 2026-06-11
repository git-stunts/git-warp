# Contributing to @git-stunts/git-warp

## Planning Sources Of Truth

- GitHub Issues — live work tracker, triage surface, and release gate input
- GitHub Milestones — release ownership and release-gate targeting
- `docs/design/<NNNN-slug>/` — active cycle work; backlog item promotes here
- `CHANGELOG.md` — what has landed
- `docs/method/retro/<NNNN-slug>/` — closed cycle retrospectives

Local backlog files and migration JSON are historical evidence unless a current
GitHub Issue links to them. Cycles are the unit of implementation work, but
GitHub Issues and Milestones are the live planning surface.
See [METHOD](../docs/METHOD.md) for the full process.

## Issue Triage

Labels are query indexes, not prose decoration. Keep issue metadata boring and
orthogonal.

Use these live axes for every open issue. New or edited issues must carry one
label from each axis:

| Axis | Required? | Values |
| --- | --- | --- |
| Type | Exactly one | `type:bug`, `type:debt`, `type:feature`, `type:docs`, `type:release`, `type:goalpost`, `type:story`, `type:maintenance` |
| Priority | Exactly one | `priority:asap`, `priority:next`, `priority:later` |
| Status | Exactly one | `status:available`, `status:blocked`, `status:active` |
| Area | Exactly one | `area:api`, `area:runtime`, `area:storage`, `area:query`, `area:sync`, `area:docs`, `area:testing`, `area:tooling`, `area:release`, `area:architecture` |
| Release target | When release-owned | GitHub Milestone such as `v18.0.0` or `v19.0.0` |

Use `status:available` for open work that is neither blocked nor actively being
worked.

Do not use release labels for new work. Release targeting belongs in GitHub
Milestones.

Legacy labels are migration-only:

| Legacy label | Replacement |
| --- | --- |
| `lane:bad-code` | `type:debt` |
| `lane:cool-ideas` | `priority:later` plus the appropriate `type:*` |
| `lane:up-next` | `priority:next` |
| `lane:asap` | `priority:asap` |
| `lane:release` | `type:release` |
| `blocked` | `status:blocked` |
| `work-in-progress` | `status:active` |
| no legacy workflow label | `status:available` |
| `release-home:vX.Y.Z` / `lane:vX.Y.Z` | GitHub Milestone `vX.Y.Z` |
| `feature:*` / `legend:*` | One `area:*` label, with doctrine in the issue body |

Release gates must fail when a required label or milestone is missing. A
missing label is not evidence that no matching issues exist.

## Cycle Process

A cycle is one backlog item, start to finish:

1. **Pull** — promote a backlog item to `docs/design/<NNNN-slug>/`
2. **Design** — write the design doc; add hills, playback questions, non-goals
3. **Spec** — write failing tests as executable spec
4. **Implement** — make the tests pass
5. **Close** — retrospective, drift audit, CHANGELOG, tech debt journal,
   cool ideas

### Retrospectives

Every closed cycle gets a retrospective in `docs/method/retro/<NNNN-slug>/`.
At minimum:

1. Governing design docs and backlog IDs
2. What actually landed
3. Design Alignment Audit — label each point as `aligned`, `partially aligned`,
   or `not aligned`
4. Observed drift — classify as deliberate tradeoff, implementation shortcut,
   hidden constraint, test gap, or design ambiguity
5. Resolution — update design docs, add follow-on backlog item, or fix
   immediately

Do not treat a passing test suite as proof that the design was honored.

## Getting Started

```bash
git clone git@github.com:git-stunts/git-warp.git
cd git-warp
npm install          # installs deps, sets up git hooks
npm run test:local   # run unit tests
```

## Git Hooks

Custom hooks in `scripts/hooks/`, auto-configured on `npm install`.

- **pre-commit** — ESLint on staged JS files
- **pre-push** — 8-gate IRONCLAD firewall (tsc, policy, consumer types,
  ESLint, ratchet, surface, markdown, tests)

## Code Style

- ESLint enforces style. Run `npx eslint .` to check.
- Template literals over concatenation
- Always use curly braces for if/else
- Keep functions focused, avoid deep nesting

## Running Tests

```bash
npm run test:local       # Stable sharded unit tests without Docker
npm run test:local:raw   # Direct Vitest unit-test runner for investigation
npm test                 # Stable sharded unit tests in Docker
npm run test:matrix      # Full multi-runtime matrix in Docker
```

`test:local` uses the resource-deterministic runner in
`scripts/run-stable-unit-tests.ts`. It prints Node, Vitest, worker-count, and
memory facts before spawning Vitest, runs non-overlapping shards sequentially,
and caps each Vitest process with `--maxWorkers`.

Use `WARP_TEST_MAX_WORKERS=<n>` to lower or raise the per-shard worker cap.
Use `WARP_TEST_MIN_FREE_MB=<n>` to change the preflight memory floor only with
an explicit operator decision. Do not raise timeouts to mask runner resource
contention; make resource assumptions explicit.

### No-Coordination Invariant

`test/unit/domain/WarpGraph.noCoordination.test.js` is non-negotiable for
multi-writer safety. Must pass before any PR.

## Pull Requests

1. Branch from the latest green branch
2. Clear commit messages; docs-atomic (CHANGELOG + code in same commit)
3. All tests pass, all lint gates pass
4. Submit PR with clear description
