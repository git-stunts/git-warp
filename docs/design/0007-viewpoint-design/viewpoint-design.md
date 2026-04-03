# Cycle 0007 — Viewpoint Class Hierarchy Design

## Sponsor human

James

## Sponsor agent

Claude

## Hill

A complete design document exists that James can read, evaluate, and
approve before any code is written. The document explains what
Viewpoint is, how it works, what the API looks like, and how the
migration proceeds.

## Playback questions

### Human

- Does the Viewpoint concept make sense as the theory-aligned
  replacement for WorldlineSource?
- Are the constructor contracts clear and correct?
- Is the migration path acceptable (backward compat vs breaking)?
- Is this ready to implement?

### Agent

- Does the design follow SSJS (P1, P2, P3, P5, P7)?
- Are all current usage sites accounted for?
- Is the breaking change surface accurately assessed?

## Accessibility / assistive reading posture

Not applicable — documentation only.

## Localization / directionality posture

Not applicable — documentation only.

## Agent inspectability / explainability posture

The design cites paper concepts, lists every usage site, and shows
before/after code examples.

## Non-goals

- No code changes in this cycle.
- Not implementing the hierarchy (that's the next cycle).
- Not renaming `Worldline` class (separate backlog item).

---

## What Is a Viewpoint?

A **Viewpoint** is the observer's vantage point for materializing
WARP state. It specifies which causal frontier to project from — a
point in the multiway DAG where the materializer should stand when
computing the graph.

In OG-IV vocabulary, it is the **F** component of a replica
`R = (S, F, Π)`:

> **Definition 2 (The Causal Frontier F).** The frontier F is a finite
> antichain of maximal known events in the global history DAG. It
> represents the observer's causal boundary — the furthest extent of
> its knowledge of concurrent worldlines.
>
> — OG-IV, §2

The three variants are three ways of specifying that frontier:

### LiveViewpoint

"Stand at the current tip of all writers."

Materializes from the full causal cone at the present moment. The
optional `ceiling` parameter caps the Lamport clock for time-travel:
"show me the graph as it was at tick N."

```javascript
const vp = new LiveViewpoint();           // current state
const vp = new LiveViewpoint(42);         // state at tick 42
```

### CoordinateViewpoint

"Stand at these specific writer tips."

Materializes from an explicit writer-tip frontier — a user-pinned
antichain in the history DAG. Used for comparison operations and
hypothetical queries.

```javascript
const vp = new CoordinateViewpoint(
  new Map([['alice', 'abc123'], ['bob', 'def456']]),
  42  // optional ceiling
);
```

### StrandViewpoint

"Stand inside this one writer's causal cone."

Materializes from a single strand's visible patch universe. Used for
branch-and-compare workflows where you want one writer's isolated
perspective.

```javascript
const vp = new StrandViewpoint('strand-abc123');
const vp = new StrandViewpoint('strand-abc123', 42);  // with ceiling
```

---

## Class Hierarchy

```text
Viewpoint (abstract base)
  ├── LiveViewpoint
  ├── CoordinateViewpoint
  └── StrandViewpoint
```

All three extend `Viewpoint`. `instanceof Viewpoint` works on any
variant. Each class is frozen after construction (`Object.freeze`).

### Viewpoint (base class)

```javascript
class Viewpoint {
  // Abstract — subclasses override
  clone() { throw new Error('Viewpoint.clone() is abstract'); }

  // Boundary factory — accepts plain { kind } objects or instances
  static from(raw) { /* ... */ }
}
```

`Viewpoint` is the dispatch type. Consumer code uses
`instanceof Viewpoint` to verify they have a valid viewpoint, then
`instanceof LiveViewpoint` (etc.) for variant dispatch.

`Viewpoint.from()` is the boundary — it accepts plain `{ kind }`
objects from the wire format, legacy API callers, and test fixtures.
Inside the domain, everything is a class instance.

### Constructor Contracts

Each constructor validates its arguments and throws `TypeError` on
invalid input. Constructors establish invariants; they perform no I/O
(P2).

#### LiveViewpoint

```javascript
class LiveViewpoint extends Viewpoint {
  constructor(ceiling) {
    // ceiling: undefined (omitted), null, or non-negative integer
    // Throws TypeError if ceiling is not null/undefined/non-negative integer
  }
}
```

| Field | Type | Invariant |
|-------|------|-----------|
| `ceiling` | `number \| null` | `null` or non-negative integer |

#### CoordinateViewpoint

```javascript
class CoordinateViewpoint extends Viewpoint {
  constructor(frontier, ceiling) {
    // frontier: Map<string, string> — must be non-empty
    //   If a plain object is passed, it is converted to Map
    //   Keys and values must be non-empty strings
    // ceiling: same rules as LiveViewpoint
  }
}
```

| Field | Type | Invariant |
|-------|------|-----------|
| `frontier` | `Map<string, string>` | Non-empty. String keys and values. Always a Map (normalized at construction). |
| `ceiling` | `number \| null` | `null` or non-negative integer |

**Design decision: normalize to Map.** The current codebase accepts
both `Map<string, string>` and `Record<string, string>` for frontier.
The Viewpoint class normalizes `Record` to `Map` at construction.
This simplifies `clone()` and all downstream code.

#### StrandViewpoint

```javascript
class StrandViewpoint extends Viewpoint {
  constructor(strandId, ceiling) {
    // strandId: non-empty string
    // ceiling: same rules as LiveViewpoint
  }
}
```

| Field | Type | Invariant |
|-------|------|-----------|
| `strandId` | `string` | Non-empty string |
| `ceiling` | `number \| null` | `null` or non-negative integer |

### clone()

Each subclass implements `clone()` returning a deep copy of the same
type:

- `LiveViewpoint.clone()` → `new LiveViewpoint(this.ceiling)`
- `CoordinateViewpoint.clone()` → `new CoordinateViewpoint(new Map(this.frontier), this.ceiling)`
- `StrandViewpoint.clone()` → `new StrandViewpoint(this.strandId, this.ceiling)`

### Viewpoint.from()

The boundary factory. Accepts plain objects with a `kind` discriminant
and returns the appropriate class instance:

```javascript
Viewpoint.from({ kind: 'live' })
  → new LiveViewpoint()

Viewpoint.from({ kind: 'live', ceiling: 42 })
  → new LiveViewpoint(42)

Viewpoint.from({ kind: 'coordinate', frontier: { alice: 'abc' }, ceiling: null })
  → new CoordinateViewpoint(new Map([['alice', 'abc']]), null)

Viewpoint.from({ kind: 'strand', strandId: 'strand-abc', ceiling: 10 })
  → new StrandViewpoint('strand-abc', 10)

Viewpoint.from(existingViewpoint)
  → existingViewpoint (returned as-is, it's already a class)

Viewpoint.from(null)
  → new LiveViewpoint()  (null/undefined defaults to live)
```

---

## The `kind` Question

**No stored `kind` property.** The class identity IS the kind.

- Internal dispatch: `instanceof LiveViewpoint`
- Serialization: the codec inspects `instanceof` and writes a `kind`
  tag. This is P5 — serialization is the codec's problem.
- Debugging: `console.log(vp)` shows `LiveViewpoint { ceiling: null }`
  — the class name is more informative than a string tag.
- Tests: `expect(vp).toBeInstanceOf(LiveViewpoint)` instead of
  `expect(vp.kind).toBe('live')`.

If a consumer genuinely needs a string discriminant (e.g., for
logging, JSON output, or display), they use `instanceof`:

```javascript
function viewpointKind(vp) {
  if (vp instanceof LiveViewpoint) { return 'live'; }
  if (vp instanceof CoordinateViewpoint) { return 'coordinate'; }
  if (vp instanceof StrandViewpoint) { return 'strand'; }
}
```

This function lives on the codec or presenter side, not on the
domain class.

---

## How It Changes Consumer Code

### Worldline.js

**Before:**

```javascript
function cloneWorldlineSource(source) {
  const value = source ?? { kind: 'live' };
  if (value.kind === 'live') { return cloneLiveSource(value); }
  if (value.kind === 'coordinate') { return cloneCoordinateSource(value); }
  return { kind: 'strand', strandId: value.strandId, ceiling: value.ceiling ?? null };
}
```

**After:**

```javascript
// No clone functions needed. Viewpoint.from() + clone() replaces them all.
const viewpoint = Viewpoint.from(source).clone();
```

**Before (materializeSource dispatch):**

```javascript
if (source.kind === 'live') { return await materializeLiveSource(graph, source, collectReceipts); }
if (source.kind === 'coordinate') { return await materializeCoordinateSource(graph, source, collectReceipts); }
return await materializeStrandSource(graph, source, collectReceipts);
```

**After:**

```javascript
if (source instanceof LiveViewpoint) { return await materializeLiveSource(graph, source, collectReceipts); }
if (source instanceof CoordinateViewpoint) { return await materializeCoordinateSource(graph, source, collectReceipts); }
return await materializeStrandSource(graph, source, collectReceipts);
```

### Observer.js

Five clone functions (`cloneObserverSource`, `cloneNonNullSource`,
`cloneLiveSource`, `cloneCoordinateSource`, plus strand inline)
collapse into one call: `Viewpoint.from(source).clone()`.

### QueryController.js

Same pattern — `cloneObserverSource()` becomes `Viewpoint.from()`,
dispatch switches from `source.kind ===` to `instanceof`.

### Tests

Three test files have `.kind` assertions:

```javascript
// Before
expect(worldline.source.kind).toBe('live');

// After
expect(worldline.source).toBeInstanceOf(LiveViewpoint);
```

---

## Public API Surface

### index.js exports

```javascript
export {
  Viewpoint,
  LiveViewpoint,
  CoordinateViewpoint,
  StrandViewpoint,
  // ...
};
```

### index.d.ts

```typescript
export class Viewpoint {
  clone(): Viewpoint;
  static from(
    raw: Viewpoint | { kind: string; [key: string]: unknown } | null | undefined
  ): Viewpoint;
}

export class LiveViewpoint extends Viewpoint {
  constructor(ceiling?: number | null);
  readonly ceiling: number | null;
  clone(): LiveViewpoint;
}

export class CoordinateViewpoint extends Viewpoint {
  constructor(
    frontier: Map<string, string> | Record<string, string>,
    ceiling?: number | null,
  );
  readonly frontier: Map<string, string>;
  readonly ceiling: number | null;
  clone(): CoordinateViewpoint;
}

export class StrandViewpoint extends Viewpoint {
  constructor(strandId: string, ceiling?: number | null);
  readonly strandId: string;
  readonly ceiling: number | null;
  clone(): StrandViewpoint;
}
```

### Backward Compatibility

`WorldlineSource` becomes a deprecated type alias:

```typescript
/** @deprecated Use Viewpoint, LiveViewpoint, CoordinateViewpoint, or StrandViewpoint. */
export type WorldlineSource = Viewpoint;
```

`Viewpoint.from()` accepts the old `{ kind: 'live' }` plain objects,
so existing consumer code that constructs sources as plain objects
still works — they just need to pass through `from()` at the boundary
(which the Worldline/Observer/QueryController constructors do
internally).

The `WorldlineOptions` and `ObserverOptions` interfaces accept both
`Viewpoint` instances and plain `{ kind }` objects:

```typescript
export interface WorldlineOptions {
  source?: Viewpoint | { kind: 'live'; ceiling?: number | null }
    | { kind: 'coordinate'; frontier: Map<string, string> | Record<string, string>; ceiling?: number | null }
    | { kind: 'strand'; strandId: string; ceiling?: number | null };
}
```

This means: no breaking change for consumers who pass plain objects.
Breaking change only for consumers who read `.kind` on returned
viewpoints.

---

## File Layout

One type per source file (CLAUDE.md rule):

```text
src/domain/types/
  Viewpoint.js           # Base class + from() factory
  LiveViewpoint.js
  CoordinateViewpoint.js
  StrandViewpoint.js
```

---

## What About defaultCodec?

The `defaultCodec.js → infrastructure` move (P5 fix) is a separate
concern from the Viewpoint hierarchy. It should be a separate commit
in the same cycle or a separate cycle entirely. It does not depend on
or interact with the Viewpoint work.

---

## Implementation Sequence (for the next cycle)

1. **RED**: Write tests for the four new classes — constructor
   validation, freeze, clone, from, instanceof.
2. **GREEN**: Implement the four class files.
3. **RED**: Update existing tests — `.kind` assertions become
   `instanceof`.
4. **GREEN**: Migrate Worldline.js — replace clone functions and
   dispatch.
5. **GREEN**: Migrate Observer.js — same pattern.
6. **GREEN**: Migrate QueryController.js — same pattern.
7. Update index.d.ts and index.js exports.
8. Lint, tsc, full test suite.

---

## ComparisonController

ComparisonController creates `{ kind: 'live' }` and
`{ kind: 'strand' }` objects, but it also has a `strand_base` variant
that is NOT a Viewpoint — it's an internal comparison selector.

ComparisonController's objects flow into
`graph.materialize()`/`materializeCoordinate()`/`materializeStrand()`
directly, not through the Viewpoint path. They are a separate type
hierarchy (identified in the noun audit as a future backlog item:
`NDNM_comparison-pipeline-class-hierarchy`).

**No changes to ComparisonController in this work.**

---

## Cross-Repo Alignment: warp-ttd

The `warp-ttd` debugger (in `~/git/warp-ttd`) already has a
formalized vocabulary in its glossary (`docs/design/glossary.md`) and
vision document (`VISION.md`). The Viewpoint design must be consistent
with TTD's usage of these terms.

### TTD Glossary Alignment

| TTD term | TTD definition | git-warp alignment |
|----------|----------------|-------------------|
| **worldline** | Causal history of a deterministic graph. A lane whose ticks form a linear chain. | git-warp's `Worldline` class is NOT this — it's a read handle. The real worldline is the per-writer patch chain under `refs/warp/<graph>/writers/<writerId>`. TTD is correct; git-warp is misnamed (tracked in R1). |
| **strand** | Speculative branch forked from a worldline. Writable, forkable. | git-warp's strand concept matches. |
| **lane** | Generic for worldline or strand. | Not in git-warp vocabulary. Could be useful. |
| **tick** | Lamport clock value on a single lane. | git-warp uses `ceiling` for this in Viewpoint. Consistent. |
| **aperture** | What an observer preserves/projects. | git-warp's `Aperture` interface matches. TTD notes: "Lens is reserved for the optics formalism." |
| **receipt** | Structured provenance for a tick transition. | git-warp's `TickReceipt` matches. |

### What TTD Confirms

1. **Worldline is causal history, not a read handle.** TTD's glossary
   is explicit: "A worldline is a lane whose ticks form a linear chain
   of causally ordered states." git-warp's `Worldline` class doesn't
   model this. The Viewpoint refactor is correct to NOT name itself
   after worldlines.

2. **"Lens" is reserved for the optics formalism.** TTD's vocabulary
   table says "Prefer aperture, avoid lens (for observer projection)."
   The Viewpoint design avoids "lens" — correct.

3. **TTD consumes `WorldlineSource` implicitly** through the git-warp
   adapter. When git-warp renames `WorldlineSource` → `Viewpoint`,
   the TTD adapter will need updating. This is an internal adapter
   change, not a protocol change — TTD's protocol uses its own types
   (`Coordinate`, `PlaybackHeadSnapshot`), not git-warp's domain types.

### Impact on TTD

The Viewpoint rename in git-warp is **internal to git-warp's domain**.
TTD's git-warp adapter (`src/adapters/git-warp/`) imports from
`@git-stunts/git-warp` but does not directly import `WorldlineSource`
— it uses the public API (`graph.worldline()`, `graph.observer()`).
The `source` parameter passed to these methods will continue to accept
plain `{ kind }` objects via `Viewpoint.from()`, so the adapter should
not break.

When git-warp bumps to the next major version with the `Worldline`
class rename (R1), TTD's adapter will need updating. That's a
separate concern.
