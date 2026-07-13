# Strands

Strands are currently an operator workflow exposed through the CLI. The v19
package does not publish the former graph-first strand capability bag.

A strand is not a Git branch or worktree. It is a WARP coordinate plus an
overlay patch log. That makes it useful for review lanes, proposed changes,
experiments, and agent work that should remain outside admitted live truth.

## Strand model

A strand patch lands on the strand overlay, not the live writer chain. Braids
let one strand read support overlays from other strands when a review lane needs
related speculative work without collapsing it into live truth.

The current implementation records pinned braid support overlays. It is real
runtime behavior, but common-basis braid validation and live holographic braid
realization remain future architecture. Keep docs precise: shipped braids are
pinned overlays, not a general distributed merge protocol.

Transfer planning belongs with comparison and governance workflows. Do not
model strand transfer as a Git branch merge. Materialization is for diagnostics,
receipts, and review evidence, not the normal application read path.

## CLI workflow

```bash
git warp strand create --repo ./team-repo --id review-auth --owner alice --scope "OAuth review"
git warp strand show review-auth --repo ./team-repo
git warp strand braid review-auth --repo ./team-repo --support peer-review --read-only
git warp strand materialize review-auth --repo ./team-repo --receipts
git warp strand compare review-auth --repo ./team-repo --against live
git warp strand transfer-plan review-auth --repo ./team-repo --into live
git warp strand drop review-auth --repo ./team-repo
```

There is intentionally no equivalent v19 TypeScript example. Importing
`src/domain/WarpGraph.ts` would couple application code to an internal
composition root that can change without package-level compatibility promises.

## See also

- [Querying](querying.md)
- [Git substrate](git-substrate.md)
- [Operations](../operations/)
- [CLI](cli.md)
