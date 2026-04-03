# Contributing to @git-stunts/git-warp

## Planning Sources Of Truth

- `docs/method/backlog/` — lane-organized backlog (inbox/, asap/, up-next/, cool-ideas/, bad-code/)
- `docs/design/<NNNN-slug>/` — active cycle work; backlog item promotes here
- `CHANGELOG.md` — what has landed
- `docs/method/retro/<NNNN-slug>/` — closed cycle retrospectives

No milestones. No ROADMAP. Cycles are the unit of work.
See [METHOD.md](../../METHOD.md) for the full process.

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
npm run test:local       # Unit tests without Docker
npm test                 # Unit tests (Docker)
npm run test:matrix      # Full multi-runtime matrix (Docker)
```

### No-Coordination Invariant

`test/unit/domain/WarpGraph.noCoordination.test.js` is non-negotiable for
multi-writer safety. Must pass before any PR.

## Pull Requests

1. Branch from the latest green branch
2. Clear commit messages; docs-atomic (CHANGELOG + code in same commit)
3. All tests pass, all lint gates pass
4. Submit PR with clear description
