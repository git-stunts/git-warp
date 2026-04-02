# NO_DOGS_NO_MASTERS

Break up the gods. Free their vassals.

## What it covers

God object decomposition and phantom-type liberation. Two sides
of the same coin: god objects hoard responsibilities behind a
single class, and `@typedef {Object}` phantoms masquerade as data
structures while contributing nothing at runtime.

**The Gods** — bloated service classes that own everything and
delegate nothing. StrandService (2,048 LOC, 40+ methods).
WarpRuntime (6,613 LOC across warp/ mixins). They know too much,
do too much, and make every edit a full-context-window affair.

**The Vassals** — `@typedef {Object}` shapes that get constructed,
frozen, serialized, passed around, and queried — doing all the
work of a class without ever becoming one. They exist only at
type-check time. No `instanceof`. No constructors. No methods.
Phantom types serving phantom masters.

The fix is the same for both: real JavaScript. Classes with
constructors that validate. Methods that live next to their data.
Files you can grep for with `instanceof`. Code that exists at
runtime because it has something to do at runtime.

## Who cares

### Sponsor human

James — wants to open a file and find one thing. Wants `instanceof`
to work. Wants the TypeScript layer to describe reality, not
invent a parallel universe of shapes that vanish when you
`console.log` them.

### Sponsor agent

Claude — god objects force full-file reads that burn context window.
Phantom types force guessing at runtime shapes. Both multiply the
cost of every edit. A 200-LOC class with a constructor is readable
in one pass. A 2,000-LOC god object with 14 typedef vassals is not.

## What success looks like

- No service file exceeds 500 LOC
- Every data entity that gets constructed is a `class`, not a
  `@typedef {Object}`
- `@typedef` is reserved for genuinely type-only concepts: unions,
  callback signatures, import aliases
- `grep -rn '@typedef {Object}' src/domain/` returns only options
  bags, never entities
- `instanceof` works on every domain value object

## How you know

- Count of `@typedef {Object}` in `src/domain/` trends toward zero
  (options bags excepted)
- God object LOC counts shrink each cycle
- New domain entities are born as classes, never typedefs

## Current surface

### The Gods

| Item | LOC | Location |
|------|-----|----------|
| `PROTO_warpruntime-god-class` (asap/) | 6,613 | WarpRuntime + warp/ mixins |
| `PROTO_strand-service-god-object` (bad-code/) | 2,048 | StrandService.js |

### The Vassals (typedef → class)

| Item | Effort | Entity |
|------|--------|--------|
| `PROTO_typedef-dot-to-class` | XS | Dot (CRDT primitive) |
| `PROTO_typedef-eventid-to-class` | XS | EventId (causal ordering) |
| `PROTO_typedef-effectemission-to-class` | XS | EffectEmission (domain event) |
| `PROTO_typedef-deliveryobservation-to-class` | XS | DeliveryObservation (trace record) |
| `PROTO_typedef-lww-to-class` | S | LWWRegister (CRDT) |
| `PROTO_typedef-tickreceipt-to-class` | S | TickReceipt (public API) |
| `PROTO_typedef-patchdiff-to-class` | S | PatchDiff (reduce output) |
| `PROTO_typedef-trustrecord-to-class` | S | TrustRecord (trust chain) |
| `PROTO_typedef-truststate-to-class` | S | TrustState (trust aggregate) |
| `PROTO_typedef-btr-to-class` | S | BTR (tamper-evident package) |
| `PROTO_typedef-statediffresult-to-class` | S | StateDiffResult (subscriber diffs) |
| `PROTO_typedef-orset-to-class` | M | ORSet (CRDT, 10+ operations) |
| `PROTO_typedef-patchv2-to-class` | M | PatchV2 (core domain entity) |
| `PROTO_typedef-warpstatev5-to-class` | L | WarpStateV5 (CRDT materialized state) |

### Already liberated

- `AuditReceipt` — promoted from typedef to class (this session)

## Legend code

`NDNM` — for backlog items that belong to this legend.

```text
NDNM_warpruntime-decomposition.md
NDNM_typedef-tickreceipt.md
NDNM_typedef-orset.md
```
