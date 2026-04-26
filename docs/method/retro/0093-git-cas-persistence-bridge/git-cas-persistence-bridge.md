# 0093 Git-CAS Persistence Bridge

- Outcome: `resplit with write-side bridge`
- Cycle doc: [docs/design/0093-git-cas-persistence-bridge.md](/Users/james/git/git-stunts/git-warp/docs/design/0093-git-cas-persistence-bridge.md)

## What changed

- `GitGraphAdapter.writeBlob()` now delegates to
  `GitPersistenceAdapter.writeBlob()`.
- `GitGraphAdapter.writeTree()` now delegates to
  `GitPersistenceAdapter.writeTree()`.
- `GitGraphAdapter.readBlob()` kept its explicit unbounded collect and
  empty-blob existence check.
- recursive tree reads, multi-parent/signed commits, ref CAS, and ref
  deletion stayed local because git-cas does not yet expose equivalent
  semantics.
- `INFRA_unify-persistence-on-git-cas` was retired as an over-broad
  premise and replaced by `INFRA_git-cas-adapter-parity`.
- `INFRA_substrate-upgrade-tool` now depends on the explicit parity
  follow-up instead of the stale broad card.

## Drift check

The original card said "delegate everything to git-cas." That was
architecturally attractive but technically false today.

The write-side plumbing was duplicate and safe to remove. The read,
tree, commit, and ref operations carry graph-specific laws that must not
be flattened into weaker adapter methods. The successor card names those
gaps directly so the next slice can either extend git-cas or wrap it
honestly.

## Witness

- `npx vitest run test/unit/infrastructure/adapters/GitGraphAdapter.gitCasPersistence.test.ts test/unit/scripts/uniform-git-cas-closeout.test.ts`
- `npx eslint src/infrastructure/adapters/GitGraphAdapter.ts`
- `npx markdownlint docs/design/0093-git-cas-persistence-bridge.md docs/method/retro/0093-git-cas-persistence-bridge/git-cas-persistence-bridge.md docs/method/backlog/v17.0.0/INFRA_git-cas-adapter-parity.md docs/method/backlog/v17.0.0/INFRA_substrate-upgrade-tool.md docs/releases/v17.0.0/README.md docs/method/backlog/README.md docs/method/backlog/WORKLOADS.md docs/design/0092-close-uniform-git-cas.md docs/method/retro/0092-close-uniform-git-cas/close-uniform-git-cas.md docs/method/backlog/bad-code/OWN_underused-ecosystem-packages.md`
- `npm run typecheck`
- `npm run lint:sludge`
- `git diff --check`

## Known External Failure

- `npm run lint:semgrep` currently fails on 25 existing unquarantined
  domain-side anti-sludge violations outside this slice. No reported hit
  is in `GitGraphAdapter.ts` or the new git-cas bridge test.
