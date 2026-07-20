# v19 Public Vocabulary Checkpoint

> **Status:** Accepted target for `v19.0.0`.
>
> This document is the normative product vocabulary and public-surface design.
> It is not implementation evidence. Until the Runtime, Lane, Observer, and
> Observation contracts described here are implemented and covered by boundary
> tests, the currently exported timeline facade remains transitional.

The product doctrine is:

```text
Write intents. Observe lanes. Keep receipts.
```

That sentence is also the API test. Ordinary application work must not require
users to learn Git objects, refs, CAS retention, graph materialization, patches,
worldlines, braids, or holograms.

## Canonical Grammar

The public programming model is:

```text
A Runtime owns access to causal history.
A Lane is one admitted or counterfactual line of causal progression.
An Intent proposes a write to a Lane.
An Observer runs against a Lane.
That execution is an Observation.
An Observation emits Readings and leaves a Receipt.
```

The four observation nouns are not aliases:

| Noun | Responsibility |
| --- | --- |
| `Observer` | Reusable immutable executable observation plan |
| `Observation` | One resource-bounded execution of an Observer against a Lane |
| `Reading` | One bounded semantic result emitted by an Observation |
| `Receipt` | Durable terminal record of an operation |

The canonical sentence is:

> An Observer runs against a Lane, producing an Observation that emits
> Readings and leaves a Receipt.

## Disclosure Order

Documentation, generated APIs, CLI help, and MCP descriptions must disclose
concepts in this order:

### Beginner

```text
Runtime -> Lane -> Intent / Observation -> Receipt
```

### Application Author

```text
Observer -> Optic -> Reading -> Support
```

### Formal And Diagnostic

```text
Coordinate -> Witness -> Hologram -> Braid -> Transport
```

This is a dependency discipline, not merely a documentation preference. A
shallower operation must not require a deeper-layer noun unless that operation
actually needs the deeper concept.

## Package Root

The only root runtime value is `Runtime`:

```typescript
import { Runtime } from '@git-stunts/git-warp';

const runtime = await Runtime.open({
  at: '.',
  writer: 'agent-1',
});
```

The root may export the TypeScript types needed to describe the core contract,
but it must not export competing factories, adapters, graph substrate, or
generic intent and observer registries as runtime values.

`Runtime.open()` is the production composition root. It constructs and owns the
default history and artifact adapters internally. Application code does not
construct Git plumbing, git-cas, cache, retention, or graph persistence
adapters.

Internal architecture keeps those concerns behind semantic ports such as
`HistoryPort` and `ArtifactPort`. Test-specific dependency injection belongs on
the testing surface, not in the first-use constructor.

### Lifecycle

The introductory contract for `Runtime.close()` is exactly:

> Releases local resources only.

In particular, `close()` does not delete lanes, rewrite history, revoke
receipts, remove retained artifacts, or perform causal admission. It stops new
local work, allows already admitted operations to reach a defined terminal
state, and releases process-owned resources. Repeated close requests are
idempotent.

## Lanes

`Lane` replaces `Timeline` in public vocabulary. A timeline suggests a total
order. A lane permits independent progression, concurrency, strands, and
worldlines without claiming that all history is globally linear.

A lane has exactly one kind:

```typescript
type LaneDescriptor =
  | {
      kind: 'worldline';
      name: string;
    }
  | {
      kind: 'strand';
      name: string;
      parent: LaneReference;
      forkedAt: CoordinateReference;
    };
```

The implementation must use runtime-backed lane classes or descriptors that
enforce this invariant. It must not model kind using overlapping booleans such
as `speculative`, `draft`, or `canonical`. A "speculative worldline" is not a
valid state.

Single-lane operations live on `Lane`. Cross-lane operations live on `Runtime`.

```typescript
const events = await runtime.lane('events');
const draft = await runtime.fork(events, { name: 'try-admin-role' });
```

## Intents And Generated SDKs

Application authors should normally use Wesley-generated domain SDKs:

```typescript
import { users } from './generated/users.js';

const receipt = await events.write(
  users.intents.assignRole({
    subject: 'user:alice',
    role: 'admin',
  })
);
```

Generated builders return validated runtime-backed `Intent` values. They do
not return loose JSON envelopes that rely on conventions for correctness.

Generic and graph-shaped builders may exist on explicit expert surfaces for
migration, tooling, and schema authorship. They are not the root tutorial.

## Observers And Optics

Generated application code names reusable plans as observers:

```typescript
const observer = users.observers.roleOf({
  subject: 'user:alice',
});
```

An Observer contains or references the formal machinery needed to execute the
request honestly:

```text
Generated Observer
  contains an Optic
  declares an Aperture and bounds
  requires Capabilities
  obeys a Law
```

Application code asks to observe a role. It does not need to assemble the
optic, aperture, support plan, retention contract, and capability declaration
manually. `Optic` remains public for advanced composition, diagnostics, and
generated-code infrastructure without becoming first-use vocabulary.

## Observation Execution

`Lane.observe()` is synchronous. It performs only local construction and
invariant validation, then returns a dormant `Observation`:

```typescript
const observation = events.observe(observer);
```

An Observation starts when any of the following first demands execution:

1. Its async iterator is advanced.
2. A lawful convenience consumer is invoked.
3. Its `receipt` is awaited.

All three paths join the same execution. They must never start duplicate
runtime work.

The first demand also selects Reading delivery:

- iteration or a convenience consumer becomes the sole Reading consumer;
- awaiting `receipt` first selects drain-and-discard delivery;
- awaiting `receipt` after a Reading consumer starts waits for that consumer's
  execution and does not steal or duplicate Readings;
- attempting to attach a Reading consumer after drain-and-discard begins is a
  typed local lifecycle error.

```typescript
const observation = events.observe(observer);

for await (const reading of observation) {
  console.log(reading.value);
}

const receipt = await observation.receipt;
```

Awaiting `observation.receipt` without an existing Reading consumer starts the
operation and drains its readings with backpressure while discarding their
values. It must not collect the stream in memory.

If no consumer advances the iterator, invokes a convenience consumer, or
awaits the receipt, the Observation remains dormant and owns no active runtime
operation.

An Observation represents one causal operation, not a generic JavaScript
stream wrapper. Its contract owns:

- one execution identity;
- one declared or pinned basis;
- capability scope;
- resource budget;
- single-consumer reading delivery;
- cancellation and early-termination policy;
- terminal outcome;
- receipt production.

Operational uncertainty terminates through the receipt outcome. Immediate
throws are reserved for invalid local construction, corruption, violated
invariants, and implementation defects.

### Convenience Consumers

Convenience consumers are capability-specific, not universal decorations on
every Observation:

```typescript
await observation.one();
await observation.first();
await observation.all();
```

Their semantics are strict:

- `one()` proves that exactly one Reading was emitted. It is not an alias for
  the first available result.
- `first()` is exposed only when the Observer law permits witnessed early
  termination.
- `all()` is exposed only for finite Observers with a declared collection
  bound and budget.

The base v19 Observation contract does not promise all three methods. The
runtime and generated SDK expose only the consumers whose termination and
cardinality semantics they can represent honestly. Cardinality or budget
failure is typed operational failure and is recorded in the terminal Receipt.

Stopping ordinary async iteration early follows the Observer's declared
cancellation policy. It must not silently turn a partial reading set into a
successful complete Observation.

## Readings

The canonical application property is `Reading.value`:

```typescript
for await (const reading of observation) {
  consume(reading.value);
}
```

`payload` is reserved for encoded transport envelopes and adapter-level bytes.
A public Reading is a typed semantic result, not a packet.

Conceptually, a Reading carries:

```typescript
interface Reading<TValue> {
  readonly value: TValue;
  readonly coordinate: Coordinate;
  readonly support: SupportReport;
  readonly witnessRefs: readonly WitnessReference[];
}
```

The concrete implementation must use runtime-backed domain objects rather than
trusting this illustrative interface shape. Introductory code needs only
`value`; coordinate, support, and witness references are progressively
disclosed when applications need provenance or formal inspection.

A Reading may contain a scalar, document, file tree, graph chart, debugger
snapshot, computed status, or another bounded materialized projection. `Chart`
is therefore an interpretation or subtype of Reading, not its replacement.

`ObservationPage` is not a public causal noun. Paging and batching are
transport framing.

## Admission Outcomes, Evidence, And Receipts

Admission classifies how a well-formed proposed history relates to the
destination history under an explicit basis and law. The admission outcome
algebra is exactly:

```text
derived
plural
conflict
obstruction
```

Implementation checkpoint: the transitional `Timeline.write()` surface now
returns this closed `AdmissionOutcome` union. Transitional read and join
receipts still have operation-specific status strings; those are not admission
classifications and are not root outcome aliases.

These variants are disjoint causal relations, not success and failure labels:

| Outcome       | Meaning                                                            | Residual posture               |
| ------------- | ------------------------------------------------------------------ | ------------------------------ |
| `derived`     | The proposal directly extends the destination basis                | Destination frontier advanced  |
| `plural`      | Concurrent histories are non-interfering and both are admitted     | Plural coordinates retained    |
| `conflict`    | Honest claims overlap an exclusive footprint                       | Conflict remains unsettled     |
| `obstruction` | Law, authority, evidence, budget, or basis gates prevent admission | Destination frontier unchanged |

`plural` is a lawful terminal posture. It is not a successful conflict or an
error waiting to be linearized. A settlement policy may later promote a plural
coordinate, but admission does not choose a winner merely because a
conventional API expects one value.

For every structurally well-formed proposal evaluated against a resolved
destination basis and law family, a completed admission produces exactly one
of these four outcomes. A failed derivation proof is an `obstruction` with the
stable reason family `invalid-derivation`. An unparseable envelope never enters
the admission mapping. Process crashes, I/O failures, corruption, and internal
invariant violations are runtime failures outside this four-way union.

Every outcome requires a distinct runtime-backed witness:

```text
derived      -> DerivationWitness
plural       -> PluralityWitness
conflict     -> ConflictWitness
obstruction  -> ObstructionWitness
```

The witnesses bind the decision to source and destination identities, source
and destination bases, proposal digest, law and profile digests, and the
evaluation coordinate. Variant-specific evidence records direct extension,
non-interference, overlap, or the exact obstruction reason. The outcome also
carries a residual posture so callers do not reconstruct resulting topology
from a label.

Admission execution is a separate outer union:

```text
completed -> AdmissionOutcome
failed    -> AdmissionRuntimeFailure
```

A runtime failure is not an obstruction. Obstruction is a completed causal
classification; a runtime failure means classification did not complete.

The operation axis remains separate:

```text
write
observe
settle
fork
sync
```

Observation cardinality and epistemic support remain separate from both. A
plural admission may produce one Reading, and a derived admission may produce
many. A derived admission does not by itself prove that an application claim
is supported, and a supported claim does not change a conflict into a derived
admission.

Introductory documentation defines Receipt simply:

> A receipt records what the runtime did.

The witness ladder, reintegration core, hologram references, translated
evidence, and residual support structure belong in application-author or
formal documentation.

Human rendering visually separates operational and epistemic fields:

```text
Receipt
------------------------------
Operation    write
Admission    derived
Lane         events
Coordinate   @842

Evidence
Witness      retained (native)
Support      supported
Residuals    none
```

A bare `Witness yes` or checkmark is insufficient because retained, native,
translated, and verified evidence are different claims. CLI text and custom
runtime inspection use the same renderer. `--json` and `--jsonl` emit canonical
machine-readable envelopes.

## Settlement

Admission and settlement are different phases. Admission classifies how
histories meet. Settlement is the later, law-governed promotion of a plural or
resolved coordinate into a canonical shared Lane. A `conflict` has not settled,
an `obstruction` cannot settle, and a `plural` admission may lawfully remain
plural forever.

```text
Proposed suffix
      |
      v
Derivation verification
      |
      v
Destination admission
  /      |       |          \
derived plural conflict obstruction
   |       |       |           |
advance  retain  resolve     repair/stop
frontier plurality
```

Settlement is a cross-lane Runtime operation. Preview presentation and the
executable plan are distinct values:

```typescript
const preview = await runtime.previewSettlement({
  source: draft,
  target: events,
});

inspect(preview);

const receipt = await runtime.settle(preview.plan);
```

`SettlementPreview` is inspectable presentation plus evidence. Its `plan` is an
immutable, runtime-backed `SettlementPlan` bound to source and target Lane IDs,
their exact frontiers, proposal digest, law digest, settlement-policy digest,
and its own plan digest. `Runtime.settle()` accepts only a validated
SettlementPlan, never an arbitrary object that resembles preview output.

Settlement revalidates the plan against the current source and target
frontiers and law. A preview does not reserve, admit, publish, linearize, or
mutate canonical history. A stale plan is reclassified as a `stale-basis`
obstruction or replaced by a newly previewed classification; it never executes
unchecked against a different basis. Any change to a bound frontier, proposal,
law, or settlement policy invalidates the plan.

```text
plural or resolved coordinate
            |
            v
     previewSettlement
            |
            v
      SettlementPlan
            |
            v
         settle()
            |
            v
 canonical promotion receipt
```

Use `previewSettlement()`, not `settle({ dryRun: true })`. Do not use `merge()`
as the first-use verb. Braid remains the formal implementation noun until the
runtime can honestly expose common-basis braid validation.

## Derived Graph Charts

There is no `@git-stunts/git-warp/graph` public package.

Graph-shaped observations live under the derived-view package:

```typescript
import { graph } from '@git-stunts/git-warp/charts';

const observation = events.observe(
  graph.neighborhood({
    around: 'user:alice',
    depth: 2,
  })
);
```

This surface may expose node, edge, neighborhood, topology, and graph-diff
Observers. It must describe their results as charts or readings, not as the
durable territory or a mutable graph store.

`/charts` is absent from the first-use README path. It exists for users who
actually need graph-shaped correlation and coordination.

## Supported Package Surfaces

The intended package families are:

| Surface | Role |
| --- | --- |
| root | `Runtime` plus type-only core contracts |
| `/charts` | Derived graph-shaped Observers and Readings |
| `/diagnostics` | `doctor`, repair planning, audit, and Receipt inspection |
| `/advanced` | Optics, Coordinates, Witnesses, Holograms, and formal composition |
| `/testing` | Explicit fake ports, fixtures, and Runtime harnesses |

`/advanced` is not a holding area for everything removed from root. Legacy
graph-first APIs are removed rather than hidden under a new public contract.

WARP DRIVE, WARP-TTD, offline bundles, and other ecosystem products are not
advertised as shipped git-warp surfaces until their implementations and
conformance evidence exist.

## CLI Grammar

The CLI follows the same verbs and nouns:

```text
git warp write
git warp observe
git warp fork
git warp settle preview
git warp settle apply
git warp receipt show
git warp doctor
git warp repair
git warp audit
```

Each CLI invocation opens and closes local Runtime resources internally. CLI
help does not teach sessions, Git adapters, OIDs, graph stores, or cache
management for ordinary operations.

Human output defaults to the shared Reading and Receipt renderers. `--json`
emits one canonical envelope; streaming commands support `--jsonl` without
renaming transport batches as pages.

## MCP Grammar

MCP exposes the same model through tools and resources rather than inventing a
second ontology. The target capability families are:

```text
warp_lane_describe
warp_intent_write
warp_observation_start
warp_observation_read
warp_observation_cancel
warp_receipt_get
warp_settlement_preview
warp_settlement_apply
warp_doctor
warp_repair
warp_audit
```

Observation tools exchange Observation identities, Readings, terminal state,
and Receipt references. MCP cursors and batches are transport details. They do
not introduce public nouns such as `ObservationPage` or `QueryResultPage`.

Wesley may generate domain-specific MCP tools and schemas from the same
Observer and Intent definitions used by TypeScript SDKs. Generated descriptions
must use this vocabulary.

## Vocabulary Conformance

The accepted vocabulary should become one generated contract shared by:

- TypeDoc summaries;
- CLI command descriptions;
- MCP tool and resource descriptions;
- Wesley-generated SDK documentation;
- glossary pages;
- schema descriptions;
- public error messages;
- API and documentation boundary tests.

The implementation should define the registry once in a deterministic Wesley
or GraphQL source and generate downstream artifacts. Hand-maintained duplicate
word lists are not the target architecture.

Public-surface lint should reject these legacy terms outside explicitly marked
migration, substrate, or formal documentation:

```text
timeline
merge
graph store
generic event
OID
dry run
session
query result page
```

The gate must be AST- or schema-aware. It must not reject legitimate prose in
migration tables, Git substrate diagnostics, quoted legacy API names, or
formal explanations.

## Migration Direction

The superseded pre-checkpoint v19 facade has these dispositions:

| Transitional v19 symbol | Canonical disposition |
| --- | --- |
| `openWarp()` | `Runtime.open()` |
| `Warp` | `Runtime` |
| `Timeline` | `Lane` |
| `DraftTimeline` | `Lane` with `kind: 'strand'` |
| `timeline.read(reading)` | `lane.observe(observer)` |
| root `reading` builders | Wesley-generated `*.observers` or `/charts` |
| root `intent` builders | Wesley-generated `*.intents` |
| `previewJoin()` | `Runtime.previewSettlement()` |
| `join()` | `Runtime.settle(plan)` |
| `/storage` constructors | internal Runtime composition; testing injection under `/testing` |
| graph package proposals | `/charts` |

The v18 graph-first API remains removed. This checkpoint does not revive
`browser`, `legacy`, `openWarpGraph`, `WarpApp`, `WarpCore`, patch builders, or
public Git adapters.

## Acceptance Gates

The checkpoint is implemented only when executable evidence proves all of the
following:

1. Root runtime values contain exactly `Runtime`.
2. Ordinary open, close, lane, write, observe, and receipt workflows compile
   without importing Git, storage, graph, or formal nouns.
3. Lane kinds are mutually exclusive runtime truths.
4. Generated Intent and Observer values are validated domain objects.
5. `Lane.observe()` is synchronous and all demand paths share one execution.
6. Awaiting a Receipt drains without materializing Reading streams.
7. `Reading.value` is canonical across SDK, CLI JSON, MCP, fixtures, and
   serialized envelopes.
8. Outcome and support algebras cannot alias one another.
9. Settlement accepts only immutable validated plans and revalidates them.
10. `/graph` is absent and `/charts` is tested as a derived-view surface.
11. CLI and MCP capability names conform to the same vocabulary.
12. Legacy vocabulary is rejected from public surfaces with explicit migration
    and substrate exceptions.

Until those gates pass, this document is a frozen target and the v19 public API
goalpost remains open.
