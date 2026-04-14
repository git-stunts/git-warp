---
id: DX_bats-tests-stale-imports
---

# test/bats/ seed scripts have stale .js import paths

The bash integration tests in `test/bats/` use seed scripts
(`seed-trust.js`, `seed-setup.js`, etc.) that import from
infrastructure adapter .js paths. These paths changed to .ts
during the v17 migration. The bats tests aren't run by vitest
so they didn't fail — but they'll fail at runtime.
