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

`captureCoordinate()` verifies an existing checkpoint-tail basis. It does not
create one by materializing the whole graph. If the runtime cannot prove a
bounded basis, the read fails closed with `E_OPTIC_NO_BOUNDED_BASIS`.

Use a captured coordinate when multiple reads must answer from the same causal
position. Later writes can advance the live worldline; the coordinate keeps the
read pinned to the captured basis.

## Cost posture

These labels describe current provider cost, not aspirational architecture.

| Surface | Current posture | What to rely on |
| --- | --- | --- |
| Exact id-only query reads | Bounded | Checkpoint-tail exact reads can answer without graph-wide materialization. |
| Coordinate optic reads | Transitional | They verify checkpoint-tail evidence and fail closed when the basis is absent. |
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

Evidence failures are different. `E_OPTIC_NO_BOUNDED_BASIS`,
`E_OPTIC_TAIL_BUDGET_EXCEEDED`, and `E_OPTIC_READ_IDENTITY` mean the runtime
could not lawfully establish or preserve the read's evidence boundary.

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
