# Querying

Use this page when you are writing product code, an agent workflow, or a
local-first tool on top of `git-warp`.

The main decision is not which method exists. The main decision is which read
surface owns the question.

## Choose the read surface

| Need | Use | Why |
| --- | --- | --- |
| Write and read live admitted history | `openWarpWorldline()` | First-use application surface. |
| Read one known entity or property with bounded evidence | Optic read | Fails closed when the checkpoint-tail basis is unavailable. |
| Filter visibility for a role, tenant, or review surface | Observer | Applies an aperture over a worldline or projection. |
| Ask broader graph questions | Query builder | Supports match, predicates, traversal, selection, aggregation, and support plans. |
| Read an earlier coordinate | `seek(...)` or `graph.query.worldline({ source })` | Pins the read to a coordinate or ceiling. |
| Read speculative work | Strand source | Keeps proposed work out of live truth. |
| Inspect provenance or replay internals | Substrate capability | Diagnostic and operator path. |

## Open a worldline

```typescript
import {
  GitGraphAdapter,
  openWarpGraph,
  openWarpWorldline,
} from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';

const plumbing = new GitPlumbing({ cwd: './team-repo' });
const persistence = new GitGraphAdapter({ plumbing });

const team = await openWarpWorldline({
  persistence,
  worldlineName: 'team',
  writerId: 'alice',
});
```

Use `openWarpWorldline()` for normal application code. Use `openWarpGraph()`
only when the task intentionally needs lower-level capability namespaces such
as sync, provenance, checkpoints, comparison, or strands.

## Write live truth

```typescript
const patchSha = await team.commit((p) => {
  p.addNode('task:auth')
    .setProperty('task:auth', 'title', 'Implement OAuth2')
    .setProperty('task:auth', 'status', 'in-progress');
});
```

The callback builds one WARP patch. The patch lands under WARP refs, not under
ordinary source-tree branch refs.

## Read live truth

```typescript
const worldline = team.live();

const tasks = await worldline.query()
  .match('task:*')
  .select(['id', 'props'])
  .run();
```

The query builder supports match predicates, property filters, incoming and
outgoing traversal, selection, aggregation, support planning, and execution.
Broad wildcard and traversal shapes can still have provider caveats, so do not
claim every query is a bounded optic read.

For exact id-only reads with checkpoint-tail evidence, use
[Optic reads](optic-reads.md).

## Read through an observer

```typescript
const publicAperture = {
  match: ['task:*', 'user:*'],
  redact: ['email', 'ssn'],
};

const publicView = await worldline.observer('public-users', publicAperture);
const users = await publicView.query().match('user:*').run();
```

Observers are read-only filtered views. Redaction changes what a selected read
path returns; it is not encryption. Use [Content and CAS](content-and-cas.md)
when stored bytes need protection at rest.

## Read a historical coordinate

```typescript
const historical = await team.seek({
  source: {
    kind: 'coordinate',
    frontier: { alice: 'patch-tip-sha' },
    ceiling: 12,
  },
});

const taskAtTick12 = await historical.getNodeProps('task:auth');
```

Coordinates pin the read. They do not move Git `HEAD`.

## Read a strand

```typescript
const graph = await openWarpGraph({
  persistence,
  graphName: 'team',
  writerId: 'alice',
});

const reviewLane = graph.query.worldline({
  source: { kind: 'strand', strandId: 'review-auth' },
});

const reviewTask = await reviewLane.getNodeProps('task:auth');
```

Use [Strands](strands.md) for the full speculative-lane workflow, including
braids, comparison, diagnostic materialization, and transfer planning.

## Explain a conflict

When you need to explain why a visible value won, inspect provenance:

```typescript
const patchShas = await graph.provenance.patchesFor('task:auth');

for (const patchSha of patchShas) {
  const patch = await graph.provenance.loadPatchBySha(patchSha);
  console.log(patchSha, patch.ops.length);
}
```

Use this for diagnostics and conflict UX. Do not build a second graph runtime
above provenance output.

## See also

- [Optic reads](optic-reads.md)
- [Observers](observers.md)
- [Strands](strands.md)
- [Git substrate](git-substrate.md)
- [Sync](sync.md)
