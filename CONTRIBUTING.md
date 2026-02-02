# Contributing to @git-stunts/empty-graph

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
npm test                 # Run all tests
npm test -- <pattern>    # Run specific tests
```

### No-Coordination Invariant

The no-coordination regression suite is non-negotiable for multi-writer safety.
Ensure `test/unit/domain/WarpGraph.noCoordination.test.js` passes before submitting changes.

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes with clear commit messages
3. Ensure all tests pass: `npm test`
4. Ensure linting passes: `npx eslint .`
5. Submit a PR with a clear description
