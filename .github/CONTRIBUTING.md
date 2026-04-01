# Contributing to @git-stunts/git-warp

## Planning Sources Of Truth

- `BACKLOG/` — individual markdown files, one per item (`B{number}.md`)
- `docs/design/cycles/<cycle>/` — active work; backlog file moves here
- `CHANGELOG.md` — what has landed
- `docs/archive/retrospectives/` — closed cycle audits

No milestones. No ROADMAP. Cycles are the unit of work.

## Cycle Process

A cycle is one backlog item, start to finish:

1. **Pull** — move `BACKLOG/B{number}.md` to `docs/design/cycles/<cycle>/`
2. **Design** — the backlog file becomes the design doc; add hills, non-goals,
   invariants as needed
3. **Spec** — write failing tests as executable spec
4. **Implement** — make the tests pass
5. **Close** — retrospective, drift audit, CHANGELOG, tech debt journal,
   cool ideas

### Retrospectives

Every closed cycle gets a retrospective in `docs/archive/retrospectives/`.
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
