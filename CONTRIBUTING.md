# Contributing to @git-stunts/git-warp

## Planning Sources Of Truth

Do not duplicate the repo's "active plan" inside `CONTRIBUTING.md`.
That information drifts too easily here.

Instead, use these sources:

- `BACKLOG/README.md` for the currently active cycle and promotable pre-design
  slices
- `ROADMAP.md` for committed release and milestone inventory
- `CHANGELOG.md` for what has already landed on the branch or in released
  versions
- `docs/design/` for the governing design notes promoted from active backlog
  items

If these artifacts disagree, reconcile them as part of the cycle close instead
of letting `CONTRIBUTING.md` become a second planning registry.

## Development Loop

This repo follows the same disciplined cycle used by higher-layer products built
on git-warp:

1. design docs first
2. tests as executable spec second
3. implementation third
4. playback, retrospective, and reconciliation after the slice lands

Tests are the spec. Design docs define intent and invariants. Implementation
follows.

When a `BACKLOG/` item is selected for active work, promote it into
`docs/design/` before writing tests.

For non-trivial work, use IBM Design Thinking style framing:

- sponsor actors
- hills
- playbacks
- explicit non-goals

Keep that vocabulary in the design method. Do not leak it into the runtime
ontology unless the substrate truly needs a first-class concept.

## Retrospectives

Retrospectives are not optional cleanup. Every closed slice should leave behind
an explicit retrospective, and that retrospective must audit the landed changes
against the intended design.

At minimum, every retrospective should include:

1. governing design docs and backlog IDs
2. what actually landed
3. a `Design Alignment Audit` section
4. any observed drift
5. whether the drift is accepted, rejected, or deferred

The `Design Alignment Audit` should check the implemented slice against the
intended invariants and label each major point as:

- `aligned`
- `partially aligned`
- `not aligned`

If implementation drift occurred, the retrospective must say why:

- deliberate tradeoff
- implementation shortcut
- hidden pre-existing constraint
- test gap
- design ambiguity

And it must say how the repo resolves that drift:

- update the design docs
- add a follow-on `BACKLOG/` item
- immediately fix the implementation in the next slice

Do not treat a passing test suite as proof that the design was honored. The
retro is where we verify that the code matches the intended architecture, not
just the executable spec that happened to be written.

## Checkpoints

Most slices should pass through four checkpoints:

1. doctrine
2. spec
3. semantic
4. surface

For git-warp, "surface" often means public API, CLI, or documentation surface
rather than a GUI.

Local red while iterating is acceptable. Shared branches, pushes intended for
review, and merge submissions should be green.

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
4. When a `BACKLOG/` item becomes active, promote it into `docs/design/` before implementation. When roadmap work completes, reconcile `ROADMAP.md` and `docs/ROADMAP/COMPLETED.md` in the same commit.
5. Ensure all tests pass: `npm test`
6. Ensure linting passes: `npx eslint .`
7. Submit a PR with a clear description
