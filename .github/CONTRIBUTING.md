# Contributing to @git-stunts/git-warp

## Planning sources of truth

- GitHub Issues are the live work tracker, triage surface, and release-gate
  input.
- GitHub Milestones own release targeting.
- `CHANGELOG.md` records externally meaningful changes.
- Current public docs live in `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`,
  and `docs/topics/`.

Historical design notes, retrospectives, archived backlog files, and deleted
planning packets remain available through Git history. Do not recreate archive,
design, or retro directories as live documentation.

## Issue triage

Labels are query indexes, not prose decoration. Keep issue metadata boring and
orthogonal.

Every open issue should carry one label from each axis:

| Axis | Values |
| --- | --- |
| Type | `type:bug`, `type:debt`, `type:feature`, `type:docs`, `type:release`, `type:goalpost`, `type:story`, `type:maintenance` |
| Priority | `priority:asap`, `priority:next`, `priority:later` |
| Status | `status:available`, `status:blocked`, `status:active` |
| Area | `area:api`, `area:runtime`, `area:storage`, `area:query`, `area:sync`, `area:docs`, `area:testing`, `area:tooling`, `area:release`, `area:architecture` |

Use GitHub Milestones for release targeting. Do not create release labels for
new work.

## Documentation changes

Use the topic shelf for current docs:

- `docs/topics/getting-started.md`
- `docs/topics/optic-reads.md`
- `docs/topics/observers.md`
- `docs/topics/querying.md`
- `docs/topics/strands.md`
- `docs/topics/git-substrate.md`
- `docs/topics/content-and-cas.md`
- `docs/topics/continuum-boundary.md`
- `docs/topics/sync.md`
- `docs/topics/cli.md`
- `docs/topics/operations.md`
- `docs/topics/troubleshooting.md`

Exact API, CLI, schema, and error inventories should be generated or
coverage-checked instead of hand-maintained as prose.

## Getting started

```bash
git clone git@github.com:git-stunts/git-warp.git
cd git-warp
npm install
npm run test:local
```

## Useful checks

```bash
npm run lint
npm run typecheck
npm run test:local
```
