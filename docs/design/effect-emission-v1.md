# Effect Emission & Delivery Observation — Substrate Slice v1

**Status:** Design
**Author:** git-warp maintainers
**Date:** 2026-03-30
**Cross-repo context:** `xyph/design/effect-emission-alignment.md`, `xyph/design/substrate-alignment.md`

---

## Problem

Applications built on git-warp (XYPH, warp-ttd) need a substrate-level
story for outbound effects: diagnostic events, notifications, exports,
connector dispatches. Today there is no substrate primitive for this —
each application invents its own output bus, replay-suppression logic,
and delivery tracking.

That violates the doctrine: git-warp owns substrate facts, applications
own product meaning. If outbound effect recording and delivery
observation live above the substrate, replay/time-travel cannot be
honest without application cooperation.

## Non-Goals

- XYPH-specific ontology, governance, or workflow semantics.
- A generic untyped "object bus" that collapses effects, delivery, and
  diagnostics into one vague concept.
- Durable persistence of effect/delivery records inside the Git object
  store (v1 is in-memory; persistence is a future slice).

## Core Concepts

### 1. Effect Emission

An **EffectEmission** is a substrate fact:

> The system produced an outbound effect candidate at this coordinate.

Fields:

| Field       | Type                 | Description                                              |
| ----------- | -------------------- | -------------------------------------------------------- |
| `id`        | `string`             | Unique emission ID (UUID or similar)                     |
| `kind`      | `string`             | Effect kind — generic string, app chooses meaning        |
| `payload`   | `unknown`            | Opaque effect payload — substrate does not interpret it  |
| `timestamp` | `number`             | Wall-clock milliseconds (from ClockPort)                 |
| `writer`    | `string \| null`     | Writer ID that produced it (null if not writer-scoped)   |
| `coordinate`| `EffectCoordinate`   | Where in the worldline this effect was produced          |

`EffectCoordinate` captures the causal position:

| Field     | Type                              | Description                       |
| --------- | --------------------------------- | --------------------------------- |
| `frontier` | `Record<string, string> \| null` | Writer tip SHAs at emission time  |
| `ceiling`  | `number \| null`                 | Lamport ceiling (if capped)       |

### 2. Delivery Observation

A **DeliveryObservation** is a substrate fact:

> Sink X handled emission Y with outcome Z under externalization policy L.

Fields:

| Field        | Type              | Description                                        |
| ------------ | ----------------- | -------------------------------------------------- |
| `emissionId` | `string`          | Links to the emission                              |
| `sinkId`     | `string`          | Which sink/adapter handled it                      |
| `outcome`    | `DeliveryOutcome` | `'delivered'`, `'suppressed'`, `'failed'`, `'skipped'` |
| `reason`     | `string \| undefined` | Why (e.g., "replay mode", "transport unavailable") |
| `timestamp`  | `number`          | Wall-clock milliseconds                            |
| `lens`       | `ExternalizationPolicy`    | The execution context at delivery time             |

### 3. Delivery Lens

A **ExternalizationPolicy** is the execution/delivery context that shapes how
effects may or may not be externalized. It is not the same as an
Observer lens (which shapes what you can *see*). An externalization policy shapes
what the system is *allowed to do* with outbound effects.

| Field              | Type                               | Description                                 |
| ------------------ | ---------------------------------- | ------------------------------------------- |
| `mode`             | `'live' \| 'replay' \| 'inspect'` | Execution mode                              |
| `suppressExternal` | `boolean`                          | Whether external delivery should be blocked |

Sinks inspect the externalization policy and decide their behavior:

- **live + !suppress** → deliver normally
- **replay + suppress** → record suppression as a DeliveryObservation
- **inspect** → dry-run; record what *would* happen

### 4. Effect Sink Port

An **EffectSinkPort** is a hexagonal port. Each sink has an `id` and a
`deliver()` method:

```js
class EffectSinkPort {
  get id()  // → string
  async deliver(emission, lens)  // → DeliveryObservation[]
}
```

Single-observation sinks still return an array with one
`DeliveryObservation`. This keeps the port shape identical for direct sinks and
fan-out sinks.

Concrete adapters implement this port:

- **ConsoleEffectSink** — logs to console (infrastructure adapter)
- **ChunkEffectSink** — rotating append-only file (infrastructure)
- **NoOpEffectSink** — swallows everything (test/null adapter)
- App-specific adapters (XYPH WebSocket push, etc.)

Export is modeled as another sink — not a separate special-case path.

### 5. Multiplex Sink

A **MultiplexSink** is a domain service that fans out one emission to
multiple sinks. It implements `EffectSinkPort` itself (composite
pattern), so callers don't need to know whether they're talking to one
sink or many.

```js
class MultiplexSink extends EffectSinkPort {
  addSink(sink)     // register a child sink
  removeSink(id)    // unregister by id
  get sinks()       // → readonly sink array
  async deliver(emission, lens)  // → DeliveryObservation[] (from children)
}
```

The multiplex sink's own `deliver()` returns the concatenated child
observation arrays. Its own `id` is `'multiplex'`.

### 6. Effect Pipeline

The **EffectPipeline** is a domain service that ties it all together.
It holds a sink (typically a MultiplexSink), an ExternalizationPolicy, and a
clock. It provides:

```js
class EffectPipeline {
  constructor({ sink, lens, clock })
  async emit(kind, payload, options?)  // → { emission, observations }
  get lens()           // current externalization policy
  set lens(newLens)    // update (e.g., switch to replay mode)
  get emissions()      // → readonly emission log
  get observations()   // → readonly observation log
}
```

`emit()` creates an EffectEmission, delivers it through the sink,
collects DeliveryObservations, and appends both to the in-memory log.

The emission log is deterministic (same inputs → same emissions). The
observation log may vary (delivery depends on external adapters). Both
are inspectable.

## Replay Rules

1. Replay still produces EffectEmissions deterministically.
2. The ExternalizationPolicy during replay has `mode: 'replay'` and
   `suppressExternal: true`.
3. Sinks that respect the lens record `outcome: 'suppressed'` instead
   of actually delivering.
4. Sinks that are replay-safe (e.g., in-memory log sinks) may still
   deliver during replay — the lens is advisory, not a hard gate.
5. The emission and suppression are both inspectable by downstream
   debuggers (warp-ttd).

## Integration with Existing Receipts

EffectEmission and DeliveryObservation are a **new receipt family**,
parallel to TickReceipt. They follow the same patterns:

- Immutable, frozen value objects created via factory functions
- Deterministic canonical JSON serialization
- Validation at construction time

They do **not** extend TickReceipt. TickReceipts record CRDT operation
outcomes during materialization. Effect receipts record outbound effect
lifecycle. Different concerns, different families.

## Integration with WarpCore

WarpCore gains an optional effect pipeline, configured via `open()`:

```js
// Option A: inject a pre-built pipeline
const core = await WarpCore.open({ /* ... */ effectPipeline });

// Option B: pass sinks + lens, let open() build the pipeline
const core2 = await WarpCore.open({
  /* ... */
  effectSinks: [new ConsoleEffectSink({ logger })],
  externalizationPolicy: LIVE_LENS,
});

// Option C: configure after construction
core.effectPipeline = new EffectPipeline({ sink, lens, clock });
```

Once configured, WarpCore exposes:

```js
core.emit(kind, payload, options)    // → { emission, observations }
core.effectPipeline                  // → EffectPipeline | null
core.effectEmissions                 // → readonly EffectEmission[]
core.deliveryObservations            // → readonly DeliveryObservation[]
core.externalizationPolicy                    // → ExternalizationPolicy | null
core.externalizationPolicy = REPLAY_LENS     // switch lens (e.g., entering replay)
```

This is opt-in. Existing code that doesn't configure an effect pipeline
is unaffected — `emit()` is a no-op, getters return null/empty.

## Protocol / Versioning

- All new types are additive — no existing wire format changes.
- EffectEmission and DeliveryObservation are in-memory v1 objects, not
  persisted to Git. Future versions may add Git persistence.
- The `kind` field on emissions is an opaque string. git-warp does not
  define a registry of kinds — applications do.
- ExternalizationPolicy modes are a closed enum (`'live'`, `'replay'`,
  `'inspect'`). Adding new modes is a minor version bump.
- DeliveryOutcome values are a closed enum (`'delivered'`,
  `'suppressed'`, `'failed'`, `'skipped'`). Adding new outcomes is a
  minor version bump.

## File Layout

```text
src/
  domain/
    types/
      EffectEmission.js          # EffectEmission, EffectCoordinate factories
      DeliveryObservation.js     # DeliveryObservation factory
      ExternalizationPolicy.js            # ExternalizationPolicy factory + mode/outcome constants
    services/
      EffectPipeline.js          # Orchestrates emit → deliver → collect
      MultiplexSink.js           # Fan-out composite sink
  ports/
    EffectSinkPort.js            # Abstract sink port
  infrastructure/
    adapters/
      ConsoleEffectSink.js       # Console logging sink
      ChunkEffectSink.js         # Rotating append-only file sink
      NoOpEffectSink.js          # Null/test sink
test/
  unit/
    domain/
      types/
        EffectEmission.test.js
        DeliveryObservation.test.js
        ExternalizationPolicy.test.js
      services/
        EffectPipeline.test.js
        MultiplexSink.test.js
    infrastructure/
      adapters/
        ConsoleEffectSink.test.js
        ChunkEffectSink.test.js
        NoOpEffectSink.test.js
```

## What This Enables for Downstream

### warp-ttd

- Protocol envelopes for effect/delivery inspection
- TUI columns: emission kind, sink, outcome, suppression reason
- Replay sessions show "this effect existed but was suppressed"

### XYPH

- Lower outbound actions to `pipeline.emit('notification', ...)`
- Stop inventing private replay-suppression logic
- Provenance: every outbound action has a substrate receipt

## What Remains After v1

- **Durable persistence** — storing effect/delivery records in Git
  (ChunkEffectSink writes to filesystem, not Git objects)
- **Streaming** — async iterator over emission/observation logs
- **Audit chain** — effect-specific audit receipts (parallel to
  AuditReceiptService for TickReceipts)
- **Sink capability declarations** — sinks advertising what delivery
  modes they support
