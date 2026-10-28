# Optic reads

Use optic reads when you want to ask a bounded question of causal history
without treating the graph as one large in-memory object.

An optic names the read intent: one node, one property, a neighborhood, or a
traversal. The runtime turns that intent into a frozen `Optic` value before
execution. That value carries the target, coordinate posture, aperture posture,
basis posture, support rule, and evidence posture.

## The shipped path

```typescript
import { captureCoordinate } from '@git-stunts/git-warp/advanced';

const coordinate = await captureCoordinate(events);

const role = await coordinate
  .optic()
  .node('user:alice')
  .prop('role')
  .read();
```

`captureCoordinate()` advances the Lane's cone basis once and pins it. The cone
basis is a clone-local trie of per-entity records (`refs/warp/<lane>/cone/head`)
that folds each writer patch exactly once; advancing it reads only the patches
that are new since this clone last looked. No checkpoint or repair step is
needed, and nothing materializes the whole graph. If folding the new patches is
obstructed (see [Troubleshooting](troubleshooting.md#a-read-or-write-is-obstructed-by-the-cone-basis)),
`captureCoordinate()` rejects with `E_OPTIC_CONE_OBSTRUCTED`.

Use a captured coordinate when multiple reads must answer from the same causal
position. Later writes can advance the live worldline; the coordinate keeps
every read pinned to the captured cone root and frontier
(`coordinate.coneRoot`, `coordinate.frontierEntries`). A strand Lane's
coordinate pins the strand's basis: its forked base plus its own patches
([Strands](strands.md#reads-writes-and-saved-coordinates)).

`captureCoordinate()` also retains the captured basis clone-locally under
`refs/warp/<lane>/cone/retained`, which keeps the last 64 captured bases
reachable, so a saved Coordinate keeps reading after the Lane moves on and
`git gc --prune=now` runs. An Observation's own coordinate lives only as long as
the Observation and is not retained.

Each read answers from the records it names:

- a node or property read opens that node's one record;
- a neighborhood read opens the node, its adjacency pages, its incident edge
  records and the other endpoint of each edge (for liveness), then pages the
  visible edges in a canonical order (direction, neighbor id, label). Its cost
  follows the node's degree, never the graph size or history length;
- a traversal pins one basis and reads one neighborhood per hop under its
  explicit `maxDepth`, `maxNodes` and `maxEdges`; without them it is refused as
  global discovery.

The witness of a cone read (`readIdentity`) has `kind: 'cone-read'`, the cone
root and frontier it read at, and the keys of the records it opened. A
neighborhood cursor names a position in the canonical edge order, not a basis,
so it resumes correctly at a later basis of the same Lane.

## Cost posture

These labels describe current provider cost, not aspirational architecture.

| Surface | Current posture | What to rely on |
| --- | --- | --- |
| Lane Observations and coordinate optic reads | Bounded | Cone records: one record per node or property read, degree-bounded neighborhoods, per-hop traversal. Folding costs only new patches. |
| Strand Lane Observations, content reads and coordinate optic reads | Bounded | Cone records of the strand's basis: its pinned base plus the strand's own patches. |
| Exact id-only compatibility query reads | Bounded | Checkpoint-tail exact reads, for the deprecated graph facades only (`CheckpointTailOptic`); no Runtime or Lane entry point uses them. |
| Broad wildcard and traversal queries | Transitional | They may fall back to observer/delegate read models. |
| Whole-state materialization | Diagnostic | Use for inspection, repair, migration, or evidence collection. |
| Legacy query arrays | Legacy | Compatibility only. Do not make this the first-use model. |

Do not write docs or product code that implies every query is bounded today.
Exact id-only reads have the strongest shipped bounded evidence. Broader query
shapes must carry their caveat until their provider proves stronger behavior.

## Support rules

The support rule is the runtime's description of how much graph history a read
is allowed to need.

| Support kind | Meaning |
| --- | --- |
| Exact entity | One known node or property. |
| Neighborhood | A bounded local neighborhood around a known entity. |
| Global discovery | A wildcard or discovery read that may need broad graph knowledge. |

`BoundedSupportRule`, `CausalIndexPlan`, and `SupportFragmentPlan` already name
these postures. Support-fragment cache storage and fully plan-driven fragment
execution remain future work, so keep the distinction between shipped bounded
providers and target architecture.

## Missing values versus evidence failures

Ordinary absence is data:

- a missing node reads as a node result with `alive: false`;
- a missing property reads with `exists: false`;
- blank node ids and blank property keys are invalid optic targets.

Evidence failures are different. `E_OPTIC_CONE_OBSTRUCTED` and
`E_OPTIC_READ_IDENTITY` mean the runtime could not lawfully establish or
preserve the read's evidence boundary. Lane Observations report a cone
obstruction as an obstructed or underdetermined Receipt with a repair hint, not
as a thrown error. (`E_OPTIC_NO_BOUNDED_BASIS` and `E_OPTIC_TAIL_BUDGET_EXCEEDED`
remain on the maintenance-only checkpoint-tail optic.)

## Categorical reading

The useful product version is simple: `S` is the coordinate, `A` is the bounded
question, and `M` is the rest of history that the read deliberately does not
materialize. `captureCoordinate()` verifies that the read can factor
through a small enough support.

Chaining `.node().prop()` composes optics. The composed read remains bounded
only to the extent that the composed support rule remains bounded.

## See also

- [Getting started](getting-started.md)
- [Querying](querying.md)
- [Observers](observers.md)
- [Continuum boundary](continuum-boundary.md)
