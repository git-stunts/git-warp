# Cycle 0007 — WorldlineSource Replacement Design

## Sponsor human

James

## Sponsor agent

Claude

## Hill

A complete design document exists that James can read, evaluate, and
approve before any code is written. The document explains what
the worldline selector is, how it works, what the API looks like, and how the
migration proceeds.

## Playback questions

### Human

- Does the worldline selector concept make sense as the theory-aligned
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

## Observer vs Writer — The Conceptual Foundation

Before naming anything, we need the right mental model.

**An Observer is the projection half (π) of an optic.** It picks a
worldline and a tick, then projects what it sees. It does not rewrite,
does not own a frontier, does not produce witnesses. It is read-only.

**A Writer is the full optic Ω = (π, φ, ρ, ω, σ).** It owns a
frontier (its causal boundary), submits intents (rewrites), produces
witnesses (for reversibility), and advances the worldline. The
frontier is a writer concern, not an observer concern.

| Role | Optic | What it does |
|------|-------|-------------|
| Observer | π only | Picks a worldline + tick. Projects. |
| Writer | Ω = (π, φ, ρ, ω, σ) | Owns frontier. Focuses. Rewrites. Witnesses. Reintegrates. |

This means `WorldlineSource` is not a frontier specification (that
would make it a writer concept). It is a **worldline selector** — the
observer's choice of which worldline to observe.

## What Does the Selector Select?

In a multi-writer WARP graph, there are many possible worldlines
depending on which writers you include and at what points in their
history. The selector picks one:

### Live (canonical worldline)

"Observe the canonical worldline — all writers merged."

The worldline that results from merging every writer's patches via
CRDT join. This is the "current state of the graph." The optional
`ceiling` parameter selects a tick: "observe this worldline at tick N."

```javascript
const sel = new Live???();           // canonical worldline, latest tick
const sel = new Live???(42);         // canonical worldline at tick 42
```

### Coordinate (hypothetical worldline)

"Observe a hypothetical worldline at specific writer tips."

The worldline that would result from merging only these specific
writers at these specific commit SHAs. Used for comparison operations
and hypothetical queries — "what would the graph look like if only
alice and bob existed?"

```javascript
const sel = new Coordinate???(
  new Map([['alice', 'abc123'], ['bob', 'def456']]),
  42  // optional ceiling
);
```

### Strand (isolated worldline)

"Observe one writer's isolated worldline."

The worldline of a single strand's visible patch universe. Used for
branch-and-compare workflows — "what does this strand see?"

```javascript
const sel = new Strand???('strand-abc123');
const sel = new Strand???('strand-abc123', 42);  // at tick 42
```

### Naming — Open Question

The concept is clear: these are worldline selectors. The name is not.
Options considered and rejected:

| Name | Problem |
|------|---------|
| `«Base»` | "Weird" (human sponsor feedback) |
| `Frontier` | Frontiers are a writer concern, not an observer concern |
| `WorldlineSource` | Current name. "Source" implies origin, not selection. |

Options still on the table:

| Name | Rationale |
|------|-----------|
| `WorldlineSelector` | Says exactly what it is. Verbose but honest. |
| `Observation` | "An observation of the live worldline at tick 42." |
| `ReadTarget` | What we're targeting for materialization. |
| `CausalLens` | Optics-informed, but warp-ttd reserves "lens" for the optics formalism. |

**The right name should emerge from the domain, not be forced.**
This design doc presents the concept; the name is for James to decide.

---

## Class Hierarchy

```text
<Base> (abstract — name TBD)
  ├── Live<Base>
  ├── Coordinate<Base>
  └── Strand<Base>
```

All three extend the base class. `instanceof <Base>` works on any
variant. Each class is frozen after construction (`Object.freeze`).

### Base class

```javascript
class <Base> {
  // Abstract — subclasses override
  clone() { throw new Error('<Base>.clone() is abstract'); }

  // Boundary factory — accepts plain { kind } objects or instances
  static from(raw) { /* ... */ }
}
```

The base is the dispatch type. Consumer code uses `instanceof <Base>`
to verify they have a valid selector, then `instanceof Live<Base>`
(etc.) for variant dispatch.

`<Base>.from()` is the boundary — it accepts plain `{ kind }` objects
from the wire format, legacy API callers, and test fixtures. Inside
the domain, everything is a class instance.

### Constructor Contracts

Each constructor validates its arguments and throws `TypeError` on
invalid input. Constructors establish invariants; they perform no I/O
(P2).

#### Live«TBD»

```javascript
class Live«TBD» extends «Base» {
  constructor(ceiling) {
    // ceiling: undefined (omitted), null, or non-negative integer
    // Throws TypeError if ceiling is not null/undefined/non-negative integer
  }
}
```

| Field | Type | Invariant |
|-------|------|-----------|
| `ceiling` | `number \| null` | `null` or non-negative integer |

#### Coordinate«TBD»

```javascript
class Coordinate«TBD» extends «Base» {
  constructor(frontier, ceiling) {
    // frontier: Map<string, string> — must be non-empty
    //   If a plain object is passed, it is converted to Map
    //   Keys and values must be non-empty strings
    // ceiling: same rules as Live«TBD»
  }
}
```

| Field | Type | Invariant |
|-------|------|-----------|
| `frontier` | `Map<string, string>` | Non-empty. String keys and values. Always a Map (normalized at construction). |
| `ceiling` | `number \| null` | `null` or non-negative integer |

**Design decision: normalize to Map.** The current codebase accepts
both `Map<string, string>` and `Record<string, string>` for frontier.
The constructor normalizes `Record` to `Map` at construction.
This simplifies `clone()` and all downstream code.

#### Strand«TBD»

```javascript
class Strand«TBD» extends «Base» {
  constructor(strandId, ceiling) {
    // strandId: non-empty string
    // ceiling: same rules as Live«TBD»
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

- `Live«TBD».clone()` → `new Live«TBD»(this.ceiling)`
- `Coordinate«TBD».clone()` → `new Coordinate«TBD»(new Map(this.frontier), this.ceiling)`
- `Strand«TBD».clone()` → `new Strand«TBD»(this.strandId, this.ceiling)`

### «Base».from()

The boundary factory. Accepts plain objects with a `kind` discriminant
and returns the appropriate class instance:

```javascript
«Base».from({ kind: 'live' })
  → new Live«TBD»()

«Base».from({ kind: 'live', ceiling: 42 })
  → new Live«TBD»(42)

«Base».from({ kind: 'coordinate', frontier: { alice: 'abc' }, ceiling: null })
  → new Coordinate«TBD»(new Map([['alice', 'abc']]), null)

«Base».from({ kind: 'strand', strandId: 'strand-abc', ceiling: 10 })
  → new Strand«TBD»('strand-abc', 10)

«Base».from(existingSelector)
  → existingSelector (returned as-is, it's already a class)

«Base».from(null)
  → new Live«TBD»()  (null/undefined defaults to live)
```

---

## The `kind` Question

**No stored `kind` property.** The class identity IS the kind.

- Internal dispatch: `instanceof Live«TBD»`
- Serialization: the codec inspects `instanceof` and writes a `kind`
  tag. This is P5 — serialization is the codec's problem.
- Debugging: `console.log(vp)` shows `Live«TBD» { ceiling: null }`
  — the class name is more informative than a string tag.
- Tests: `expect(vp).toBeInstanceOf(Live«TBD»)` instead of
  `expect(vp.kind).toBe('live')`.

If a consumer genuinely needs a string discriminant (e.g., for
logging, JSON output, or display), they use `instanceof`:

```javascript
function viewpointKind(vp) {
  if (vp instanceof Live«TBD») { return 'live'; }
  if (vp instanceof Coordinate«TBD») { return 'coordinate'; }
  if (vp instanceof Strand«TBD») { return 'strand'; }
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
// No clone functions needed. «Base».from() + clone() replaces them all.
const viewpoint = «Base».from(source).clone();
```

**Before (materializeSource dispatch):**

```javascript
if (source.kind === 'live') { return await materializeLiveSource(graph, source, collectReceipts); }
if (source.kind === 'coordinate') { return await materializeCoordinateSource(graph, source, collectReceipts); }
return await materializeStrandSource(graph, source, collectReceipts);
```

**After:**

```javascript
if (source instanceof Live«TBD») { return await materializeLiveSource(graph, source, collectReceipts); }
if (source instanceof Coordinate«TBD») { return await materializeCoordinateSource(graph, source, collectReceipts); }
return await materializeStrandSource(graph, source, collectReceipts);
```

### Observer.js

Five clone functions (`cloneObserverSource`, `cloneNonNullSource`,
`cloneLiveSource`, `cloneCoordinateSource`, plus strand inline)
collapse into one call: `«Base».from(source).clone()`.

### QueryController.js

Same pattern — `cloneObserverSource()` becomes `«Base».from()`,
dispatch switches from `source.kind ===` to `instanceof`.

### Tests

Three test files have `.kind` assertions:

```javascript
// Before
expect(worldline.source.kind).toBe('live');

// After
expect(worldline.source).toBeInstanceOf(Live«TBD»);
```

---

## Public API Surface

### index.js exports

```javascript
export {
  «Base»,
  Live«TBD»,
  Coordinate«TBD»,
  Strand«TBD»,
  // ...
};
```

### index.d.ts

```typescript
export class «Base» {
  clone(): «Base»;
  static from(
    raw: «Base» | { kind: string; [key: string]: unknown } | null | undefined
  ): «Base»;
}

export class Live«TBD» extends «Base» {
  constructor(ceiling?: number | null);
  readonly ceiling: number | null;
  clone(): Live«TBD»;
}

export class Coordinate«TBD» extends «Base» {
  constructor(
    frontier: Map<string, string> | Record<string, string>,
    ceiling?: number | null,
  );
  readonly frontier: Map<string, string>;
  readonly ceiling: number | null;
  clone(): Coordinate«TBD»;
}

export class Strand«TBD» extends «Base» {
  constructor(strandId: string, ceiling?: number | null);
  readonly strandId: string;
  readonly ceiling: number | null;
  clone(): Strand«TBD»;
}
```

### Backward Compatibility

`WorldlineSource` becomes a deprecated type alias:

```typescript
/** @deprecated Use «Base», Live«TBD», Coordinate«TBD», or Strand«TBD». */
export type WorldlineSource = «Base»;
```

`«Base».from()` accepts the old `{ kind: 'live' }` plain objects,
so existing consumer code that constructs sources as plain objects
still works — they just need to pass through `from()` at the boundary
(which the Worldline/Observer/QueryController constructors do
internally).

The `WorldlineOptions` and `ObserverOptions` interfaces accept both
`«Base»` instances and plain `{ kind }` objects:

```typescript
export interface WorldlineOptions {
  source?: «Base» | { kind: 'live'; ceiling?: number | null }
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
  «Base».js           # Base class + from() factory
  Live«TBD».js
  Coordinate«TBD».js
  Strand«TBD».js
```

---

## What About defaultCodec?

The `defaultCodec.js → infrastructure` move (P5 fix) is a separate
concern from the worldline selector hierarchy. It should be a separate commit
in the same cycle or a separate cycle entirely. It does not depend on
or interact with the worldline selector work.

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
that is NOT a worldline selector — it's an internal comparison selector.

ComparisonController's objects flow into
`graph.materialize()`/`materializeCoordinate()`/`materializeStrand()`
directly, not through the worldline selector path. They are a separate type
hierarchy (identified in the noun audit as a future backlog item:
`NDNM_comparison-pipeline-class-hierarchy`).

**No changes to ComparisonController in this work.**

---

## Cross-Repo Alignment: warp-ttd

The `warp-ttd` debugger (in `~/git/warp-ttd`) already has a
formalized vocabulary in its glossary (`docs/design/glossary.md`) and
vision document (`VISION.md`). The worldline selector design must be consistent
with TTD's usage of these terms.

### TTD Glossary Alignment

| TTD term | TTD definition | git-warp alignment |
|----------|----------------|-------------------|
| **worldline** | Causal history of a deterministic graph. A lane whose ticks form a linear chain. | git-warp's `Worldline` class is NOT this — it's a read handle. The real worldline is the per-writer patch chain under `refs/warp/<graph>/writers/<writerId>`. TTD is correct; git-warp is misnamed (tracked in R1). |
| **strand** | Speculative branch forked from a worldline. Writable, forkable. | git-warp's strand concept matches. |
| **lane** | Generic for worldline or strand. | Not in git-warp vocabulary. Could be useful. |
| **tick** | Lamport clock value on a single lane. | git-warp uses `ceiling` for this in the selector. Consistent. |
| **aperture** | What an observer preserves/projects. | git-warp's `Aperture` interface matches. TTD notes: "Lens is reserved for the optics formalism." |
| **receipt** | Structured provenance for a tick transition. | git-warp's `TickReceipt` matches. |

### What TTD Confirms

1. **Worldline is causal history, not a read handle.** TTD's glossary
   is explicit: "A worldline is a lane whose ticks form a linear chain
   of causally ordered states." git-warp's `Worldline` class doesn't
   model this. The worldline selector refactor is correct to NOT name itself
   after worldlines.

2. **"Lens" is reserved for the optics formalism.** TTD's vocabulary
   table says "Prefer aperture, avoid lens (for observer projection)."
   The worldline selector design avoids "lens" — correct.

3. **TTD consumes `WorldlineSource` implicitly** through the git-warp
   adapter. When git-warp renames `WorldlineSource` → `«Base»`,
   the TTD adapter will need updating. This is an internal adapter
   change, not a protocol change — TTD's protocol uses its own types
   (`Coordinate`, `PlaybackHeadSnapshot`), not git-warp's domain types.

### Impact on TTD

The worldline selector rename in git-warp is **internal to git-warp's domain**.
TTD's git-warp adapter (`src/adapters/git-warp/`) imports from
`@git-stunts/git-warp` but does not directly import `WorldlineSource`
— it uses the public API (`graph.worldline()`, `graph.observer()`).
The `source` parameter passed to these methods will continue to accept
plain `{ kind }` objects via `«Base».from()`, so the adapter should
not break.

When git-warp bumps to the next major version with the `Worldline`
class rename (R1), TTD's adapter will need updating. That's a
separate concern.
