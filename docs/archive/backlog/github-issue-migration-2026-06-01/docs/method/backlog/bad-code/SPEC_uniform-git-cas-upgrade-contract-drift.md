---
id: SPEC_uniform-git-cas-upgrade-contract-drift
blocked_by: []
blocks: []
feature: tooling-release
release_home: v17.0.0
---

# Uniform git-cas closeout test asserts stale upgrade script text

**Effort:** S

## What's Wrong

`test/unit/scripts/uniform-git-cas-closeout.test.ts` expects
`package.json` to contain:

```text
node scripts/migrations/v17.0.0/migrate.ts
```

The package currently builds first and runs:

```text
npm run build --silent && node dist/scripts/migrations/v17.0.0/migrate.js
```

The test failure may be catching real packaging drift, but the current
assertion is a brittle source-text contract rather than a behavioral
release check.

## Suggested Fix

Replace the string assertion with behavior: prove the packed artifact
contains the migration entrypoint that `npm run upgrade` invokes, and
prove the command works from the built package shape. Keep static text
checks only for fields that are intentionally literal package metadata.
