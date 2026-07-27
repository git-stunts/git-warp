# Strands

A strand is a named child Lane pinned to a worldline Lane coordinate. Writes
land on its overlay and remain outside admitted worldline truth until a reviewed
Settlement succeeds.

A strand is not a Git branch or worktree. The Runtime persists its parent
checkpoint and frontier so another process can reopen the same bounded
coordinate.

## TypeScript

```ts
import { Runtime, type Intent } from '@git-stunts/git-warp';

declare const assignRole: Intent;

const runtime = await Runtime.open({
  at: './team-repo',
  writer: 'alice',
});

try {
  const users = await runtime.lane('users');
  const review = await runtime.fork(users, { name: 'review-auth' });

  await review.write(assignRole);

  // A later Runtime can reopen this persisted child.
  const reopened = await runtime.strand(users, { name: 'review-auth' });
  const preview = await runtime.previewSettlement(reopened, users);
  const receipt = await runtime.settle(preview.plan);
} finally {
  await runtime.close();
}
```

`Runtime.strand()` fails if the retained descriptor does not contain the
checkpoint needed to reconstruct the exact parent coordinate. The v18-to-v19
migration supplies that coordinate for legacy retained data.

Settlement plans are Runtime-owned immutable values. A lookalike object or a
plan from another Runtime is rejected.

## CLI

```bash
git warp fork \
  --repo ./team-repo \
  --lane users \
  --writer alice \
  --name review-auth

git warp write \
  --repo ./team-repo \
  --lane users \
  --strand review-auth \
  --writer alice \
  --intent '{"kind":"property.set","subject":"user:alice","key":"role","value":"admin"}'

git warp settle preview \
  --repo ./team-repo \
  --source users \
  --strand review-auth \
  --target users \
  --writer alice \
  --out settlement.json

git warp settle apply \
  --repo ./team-repo \
  --writer alice \
  --plan settlement.json
```

The saved preview is a portable review artifact, not executable authority.
`apply` reopens the selected Lanes, derives a fresh Runtime-owned plan, and
compares its plan digest, frontiers, proposal, laws, and policy before settling.

## See also

- [v19 API](api/README.md)
- [CLI](cli.md)
- [Git substrate](git-substrate.md)
