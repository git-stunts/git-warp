# Contributing to @git-stunts/git-warp

## Current Active Plan

git-warp is currently executing the v1 conflict-analyzer tranche documented in `docs/plans/conflict-analyzer-v1.md`.

Treat that plan as the active implementation source of truth for current counterfactual/conflict work. In particular:
- this tranche is **read-only**
- it performs **zero durable writes**
- it adds substrate conflict facts for XYPH to consume later
- durable artifact storage, arbitrary frontier selection, and richer worldline semantics are deferred

If older notes or speculative docs conflict with the frozen v1 plan, the plan wins for this tranche.

## Getting Started

1. Clone the repository
2. Install dependencies: `npm install`
3. Set up git hooks: `npm run setup:hooks`
4. Run tests: `npm test`

## Git Hooks

This project uses custom git hooks located in `scripts/hooks/`. Run `npm run setup:hooks` to enable them.
- Hooks are also auto-configured on `npm install` (no-op if not a git repo).
- `pre-commit` runs eslint on staged JS files.
- `pre-push` runs `npm run lint`, `npm test`, `npm run benchmark`, and the Docker bats CLI suite (`git-warp` commands).

### Pre-commit Hook

The pre-commit hook runs ESLint on all staged JavaScript files. If linting fails, the commit is blocked.

To fix lint errors:
```bash
npx eslint --fix <files>
```

To bypass temporarily (use sparingly):
```bash
git commit --no-verify
```

## Code Style

- ESLint enforces code style. Run `npx eslint .` to check.
- Use template literals instead of string concatenation
- Always use curly braces for if/else blocks
- Keep functions focused and avoid deep nesting

## Running Tests

```bash
npm test                 # Run all unit tests (Docker)
npm run test:local       # Run unit tests without Docker
npm test -- <pattern>    # Run specific tests

# Multi-runtime test matrix (Docker)
npm run test:node22      # Node 22: unit + integration + BATS CLI
npm run test:bun         # Bun: API integration tests
npm run test:deno        # Deno: API integration tests
npm run test:matrix      # All runtimes in parallel
```

### No-Coordination Invariant

The no-coordination regression suite is non-negotiable for multi-writer safety.
Ensure `test/unit/domain/WarpGraph.noCoordination.test.js` passes before submitting changes.

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Keep commits documentation-atomic: when a change affects shipped behavior, public surface, or backlog status, update `CHANGELOG.md` and the roadmap/backlog docs in the same commit.
4. Move completed backlog items out of `ROADMAP.md` and into `docs/ROADMAP/COMPLETED.md` as part of that same reconciliation.
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npx eslint .`
7. Submit a PR with a clear description
