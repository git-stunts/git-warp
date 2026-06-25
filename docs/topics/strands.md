# Strands

Use strands when work should be durable, inspectable, and separate from live
worldline truth until you intentionally compare or transfer it.

A strand is not a Git branch or worktree. It is a WARP coordinate plus an
overlay patch log. That makes it useful for review lanes, proposed changes,
experiments, and agent work that should remain outside admitted live truth.

## Create a speculative lane

```typescript
const graph = await openWarpGraph({
  persistence,
  graphName: 'team',
  writerId: 'alice',
});

const strand = await graph.strands.createStrand({
  strandId: 'review-auth',
  owner: 'alice',
  scope: 'OAuth review',
});
```

Use `openWarpGraph()` for strand controls. Normal application reads and writes
should still start with `openWarpWorldline()`.

## Patch a strand

```typescript
await graph.strands.patchStrand('review-auth', (p) => {
  p.setProperty('task:auth', 'status', 'ready-for-review');
});
```

The patch lands on the strand overlay, not the live writer chain.

## Read a strand

Read a strand through the same projection model as other pinned sources:

```typescript
const reviewLane = graph.query.worldline({
  source: { kind: 'strand', strandId: 'review-auth' },
});

const reviewTask = await reviewLane.getNodeProps('task:auth');
```

This keeps application reads on a projection handle instead of requiring custom
strand replay code in the caller.

## Braid strands

Braids let one strand read support overlays from other strands. Use them when a
review lane needs to see related speculative work without collapsing it into
live truth.

```typescript
await graph.strands.braidStrand('review-auth', {
  braidedStrandIds: ['peer-review'],
  writable: true,
});
```

The current implementation records pinned braid support overlays. It is real
runtime behavior, but common-basis braid validation and live holographic braid
realization remain future architecture. Keep docs precise: shipped braids are
pinned overlays, not a general distributed merge protocol.

## Compare and transfer

Use comparison when a strand needs review before transfer:

```typescript
const diff = await graph.comparison.diff({
  from: { kind: 'strand', strandId: 'review-auth' },
  to: 'live',
});
```

Transfer planning belongs with comparison and governance workflows. Do not
model strand transfer as a Git branch merge.

## Inspect diagnostically

`materializeStrand()` is an inspection primitive:

```typescript
const state = await graph.strands.materializeStrand('review-auth');
```

Use it for diagnostics, receipts, and review evidence. Do not make
materialized strand state the normal application read path.

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

## See also

- [Querying](querying.md)
- [Git substrate](git-substrate.md)
- [Operations](../operations/)
- [CLI](cli.md)
