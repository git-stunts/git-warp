# Effect Entity Convention

**Status:** Draft
**Date:** 2026-03-30

---

## Purpose

This document defines the graph-level convention for effect entities
in a WARP graph. It is the substrate contract that tools like warp-ttd
consume. Applications (XYPH, etc.) write effect entities; observers
read them.

This convention is **not enforced by git-warp**. git-warp is a generic
graph substrate — it does not know about effect entities. The
convention lives here as a coordination contract between applications
and tools that agree on this schema.

## Principles

1. **Effects are graph entities.** They are nodes written by
   participants (writers) via normal patch operations.

2. **The graph is inert.** Nothing about the presence of an effect
   node causes anything to happen. Observers see them. Application
   logic decides what to do.

3. **Observers are read-only.** Observers project effect entities into
   traces. They never write to the graph. If delivery needs recording,
   a participant writes a subsequent patch.

4. **Externalization is application policy.** Whether an effect gets
   delivered externally (webhook, console, file) is governed by the
   application's externalization policy, not by the graph or the
   observer.

## Reserved Namespace

Effect entities use the `effect:` node ID prefix.

```
effect:<unique-id>
```

The `<unique-id>` portion is opaque. Applications may use UUIDs,
sequential IDs, content hashes, or any string that is unique within
the graph. The substrate does not interpret it.

**Stability:** The `effect:` prefix is a coordination convention, not
a substrate-enforced reservation. git-warp does not prevent
applications from using this prefix for non-effect purposes. Misuse
is the application's problem.

## Required Properties

Every `effect:` node MUST have these properties:

| Property    | Type     | Description                                         |
| ----------- | -------- | --------------------------------------------------- |
| `kind`      | `string` | Effect kind — opaque to the substrate, app-defined  |
| `timestamp` | `number` | Wall-clock milliseconds at emission time            |

## Optional Properties

| Property    | Type                              | Description                                            |
| ----------- | --------------------------------- | ------------------------------------------------------ |
| `payload`   | `string` (JSON-serialized)        | Opaque effect payload — substrate does not interpret it |
| `writer`    | `string`                          | Writer ID that produced the effect                     |
| `ceiling`   | `number`                          | Lamport ceiling at emission time                       |

**Note on payload:** Since WARP graph properties are scalar values
(strings, numbers, booleans), complex payloads should be
JSON-serialized into a string property. Binary payloads should use
content attachments (`attachContent()`).

## Optional Links

Applications MAY add edges from effect nodes to other entities to
record causal relationships:

| Edge label      | Direction            | Target          | Meaning                                   |
| --------------- | -------------------- | --------------- | ----------------------------------------- |
| `caused_by`     | effect → source      | Any node        | The entity whose rewrite produced this effect |
| `subject`       | effect → target      | Any node        | The entity this effect is about           |

These edges are application-level conventions. git-warp does not
require or interpret them.

## Delivery Recording (Application-Level)

If an application wants to record delivery facts in the graph, it
writes them as a **participant** (writer), not as an observer.

The convention for delivery recording:

- A **sink node** (`sink:<id>`) represents a registered delivery sink
- A **`delivered_to` edge** from effect to sink records delivery:

| Edge property | Type     | Description                                            |
| ------------- | -------- | ------------------------------------------------------ |
| `outcome`     | `string` | `'delivered'`, `'suppressed'`, `'failed'`, `'skipped'` |
| `reason`      | `string` | Why (e.g., `'replay mode'`)                            |
| `timestamp`   | `number` | Wall-clock milliseconds at delivery time               |

**This is optional.** Applications that don't need delivery tracking
in the graph can skip it. The host-domain `EffectPipeline` tracks
delivery in-memory without touching the graph.

**Determinism warning:** Delivery recording makes graph state depend
on runtime behavior (which sinks are configured, whether delivery
succeeded). Two replicas with different sink configurations will
produce different `delivered_to` edges. This is acceptable because
the delivery writer is a participant making an explicit causal
choice — but applications should understand the implication.

## Observer Discovery

An observer that wants to watch for effect entities:

```js
const observer = await worldline.observer({
  match: 'effect:*',
});

const effects = await observer.getNodes();
const props = await observer.getNodeProps('effect:em-001');
```

The observer sees effect nodes through its projection. It accumulates
them. It emits structural descriptions (traces). It never writes.

For incremental discovery (new effects since last observation),
applications can use `subscribe()` on the worldline and diff the
visible effect nodes between materializations.

## Replay / Time-Travel Behavior

- **Deterministic:** Effect nodes are graph entities written by
  participants. Materialization at any coordinate produces the same
  effect nodes regardless of observer configuration.
- **Visible:** An observer matching `effect:*` sees effect nodes at
  any coordinate where they exist.
- **No external side effects:** Replay does not trigger delivery.
  The observer sees the effect nodes. Application logic (governed by
  externalization policy) decides whether to externalize.
- **Delivery edges are NOT deterministic** across replicas if
  different replicas have different sink configurations. But the
  effect nodes themselves are.

## Serialization

Effect entities follow standard WARP graph serialization:
- Properties are CBOR-encoded in patch commits
- Content attachments use the standard `attachContent()` path
- No special wire format — effect entities are regular graph nodes

## Versioning

This convention is versioned by presence of properties:

- **v1 (current):** `kind` + `timestamp` required. `payload`,
  `writer`, `ceiling` optional. `caused_by` and `subject` edges
  optional.
- **Future versions** may add required properties. They will be
  identifiable by the presence of a `convention_version` property
  on the effect node.

## What This Enables

### For warp-ttd

warp-ttd creates its own observer over a worldline, matches
`effect:*` nodes, and produces debugger traces. It does not depend
on git-warp's host-domain `EffectPipeline` — it reads graph truth
directly.

### For XYPH

XYPH writes effect nodes as part of its application patches. When a
case resolution produces a notification, XYPH adds
`effect:<id>` with `kind: 'notification'` and appropriate payload.
The effect is substrate truth.

### For any WARP application

Any application can adopt this convention to get:
- Provenance for outbound effects (via `patchesFor()`, `materializeSlice()`)
- Time-travel over effect history (via `seek()`, `ceiling`)
- Multi-writer effect convergence (via CRDT merge)
- Cross-tool observability (any observer can read effect nodes)
