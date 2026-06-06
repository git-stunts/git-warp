# Systems-Style TypeScript

**How to write TypeScript infrastructure that lasts.**

This is the engineering standard for **`git-stunts`** and all **`flyingrobots`** repositories. It is **not** a conventional style guide about semicolons, quotes, or formatting trivia. It is a doctrine for writing TypeScript infrastructure code that remains honest under execution, replay, migration, debugging, replication, failure, and time.

### Rule 0: Runtime Truth Wins

When the program is running, one question matters above all others:

**What is actually true right now, in memory, under execution?**

If the answer depends on type assertions, phantom interfaces, erased generics, wishful thinking, or editor vibes, the code is lying.

Trusted domain values must be created through runtime construction, parsing, or validation that establishes their invariants. Once established, those invariants must be preserved for as long as the value remains trusted.

This rule outranks type annotations, build steps, editor hints, compile-time tooling, team folklore, and "but the compiler said it was fine."

Rule 0 is not inspirational prose. It is a merge standard. If runtime
behavior, tests, types, and docs disagree, fix the runtime model first and
then repair the witnesses around it. Types, tests, and docs are supporting
evidence. They are not the source of truth.

### What This Means in Practice

Infrastructure cannot afford fake contracts:

- A type annotation without runtime backing is not an authoritative contract.
- An `interface` that erases at runtime is not an authoritative contract.
- A plain object that "should" have valid fields is not an authoritative contract.
- An `as` assertion is not an authoritative contract.
- A passing `tsc` build is not an authoritative contract.

These tools are useful. None of them outrank the runtime.

### Why It Matters Here

Infrastructure code touches persistence, replication, cryptographic verification, conflict resolution, deterministic replay, failure handling, system boundaries, long-lived state, version migration, and auditability. This is not view-layer glue. Mushy assumptions here turn into real bugs with long half-lives.

### The Hierarchy of Truth

When layers disagree, authority flows in this order:

1. **Runtime domain model** — constructors, invariants, methods, error types
2. **Boundary schemas and parsers** — Zod, CBOR decoders, protocol validators
3. **Tests** — the executable specification
4. **TypeScript type system** — checked documentation of the runtime model
5. **IDE and static tooling** — editor navigation, refactoring support
6. **Design docs** — human-facing explanations

TypeScript is now position 4, not position 6. It has earned its seat — but it still answers to the runtime, not the other way around.

### Scope

This standard is optimized for:

- Infrastructure code with strong invariants
- Long-lived systems with explicit boundaries
- Direct execution workflows portable across hosts
- Browser-capable cores
- TypeScript-first repositories
- Code that must be teachable, legible, and publishable

### Language Policy

#### TypeScript Is the Language

TypeScript is chosen deliberately. The type system catches real bugs at authoring time, IDEs provide first-class navigation and refactoring, and the ecosystem expects it. These are engineering advantages, not cosmetic ones.

What this standard rejects is treating the type system as the **source** of truth. Types document the runtime model. They do not replace it. A type that says `string` while the runtime holds `undefined` is a lie — and the type is the liar.

#### The Type System Serves the Runtime

Every type annotation must reflect a runtime reality. If a class validates its constructor arguments, the type signature matches what survives validation — not what the caller might pass. If a function throws on invalid input, the parameter type reflects the valid domain, not `unknown` with a prayer.

**No `any`. Ever.** Not in source, not in tests, not in type assertions, not hidden behind generics. `any` is a hole in the type system that propagates silently. It is banned without exception.

**No `unknown`.** Not as a parameter type, not as a return type, not as a field type. At raw system boundaries (JSON.parse, external APIs, wire protocols), untrusted data enters through a **parser** that produces a concrete type or throws. The parser is the boundary. `unknown` never escapes it.

```typescript
// The boundary parser. This is the ONLY place raw data is touched.
function parsePatchFromWire(bytes: Uint8Array): PatchV2 {
  const decoded = cborDecode(bytes);        // returns structured data
  return PatchV2.fromDecoded(decoded);      // validates and constructs
}

// Everything downstream speaks in concrete types.
function applyPatch(patch: PatchV2): PatchResult { /* ... */ }
```

**No `as` assertions.** Type assertions bypass the compiler. If the type system cannot prove a narrowing, add a runtime guard that does — then the compiler follows.

```typescript
// WRONG — lying to the compiler
const id = value as string;

// RIGHT — prove it at runtime, compiler follows
if (typeof value !== 'string') { throw new TypeError('expected string'); }
const id = value; // compiler knows it's string
```

#### Escape Hatch: Rust via WebAssembly

When TypeScript is insufficient — tight CPU-bound loops, memory-sensitive systems, unsafe parsing of hostile binary inputs, cryptographic kernels — use Rust.

| Layer                        | Language       | Role                                     |
|------------------------------|----------------|------------------------------------------|
| Core domain logic            | TypeScript     | Default. Portable. Browser-ready.        |
| Performance-critical kernels | Rust → Wasm    | When safety/speed constraints justify it |
| Host adapters                | TypeScript     | Node, Deno, browser — behind ports       |
| Orchestration                | TypeScript     | Glue between cores and hosts             |

### Architecture

#### Browser-First Portability

The browser is the most universal deployment platform and the ultimate portability test. Core logic prefers web-platform-friendly primitives:

```typescript
// Portable
const bytes = new TextEncoder().encode(text);
const arr = new Uint8Array(buffer);
const url = new URL(path, base);

// Node-only — belongs in adapters
const buf = Buffer.from(text, 'utf8');
const resolved = require('path').resolve(p);
```

#### Hexagonal Architecture Is Mandatory

Core domain logic must never depend directly on Node globals, filesystem APIs, `process`, `Buffer`, or host-specific calls. Those belong behind adapter ports.

```typescript
// Core speaks in portable terms
class ReplicaEngine {
  private readonly storage: StoragePort;
  private readonly clock: ClockPort;
  private readonly codec: CodecPort;

  constructor(storage: StoragePort, clock: ClockPort, codec: CodecPort) {
    this.storage = storage;
    this.clock = clock;
    this.codec = codec;
  }

  async applyOp(op: Op): Promise<void> {
    const timestamp = this.clock.now();
    const bytes = this.codec.encode(op);
    await this.storage.put(op.key, bytes, timestamp);
  }
}

// Adapter implements the port for a specific host
class NodeFsStorageAdapter implements StoragePort {
  async put(key: string, bytes: Uint8Array, timestamp: string): Promise<void> {
    const filePath = path.join(this.root, key);
    await fs.writeFile(filePath, bytes);
  }
}
```

#### Dependency Injection Is Mandatory

Core dependencies enter through constructors or explicit method parameters.
No domain object may reach sideways for a global service, singleton,
service locator, ambient process state, host API, or concrete adapter.

This rule does **not** ban `new` in core. Core may construct domain value
objects, entities, outcomes, errors, cursors, coordinates, CRDT records, and
other runtime model objects. That is how runtime truth is established.

What core may not construct is a concrete host capability:

- no infrastructure adapters
- no filesystem, network, process, or environment implementation
- no ambient clock or entropy source
- no concrete persistence implementation
- no codec with host side effects

Those capabilities are ports. Adapters implement the ports. Core receives the
ports and owns only the domain behavior.

#### Encoding and Decoding Stay at Boundaries

Serialization, deserialization, and codec work happen in adapters, codec
ports, or named boundary reader modules. After decoding, values must be
validated and converted into runtime-backed domain objects before behavioral
domain logic branches on them.

Decoded DTOs may cross a boundary only as transport shapes. They do not get to
masquerade as domain concepts. A parser or boundary reader has one job: turn
untrusted bytes and shapes into validated runtime values, or fail with a typed
error.

### The Object Model

Systems-style TypeScript organizes code around four categories of **runtime-backed** objects:

Prefer classes with constructors for domain concepts. The lighter
`Interface + Factory + Brand` pattern is discouraged for domain modeling
because it leaves too much trust in erased structural types. It is allowed
only for pure transport DTOs, deliberately hot-path primitives, or cases where
structural typing is itself the intended contract.

**Value Objects** — Meaningful domain values with invariants

```typescript
class ObjectId {
  private readonly hex: string;

  constructor(hex: string) {
    if (!/^[0-9a-f]{40,64}$/.test(hex)) {
      throw new InvalidObjectId(hex);
    }
    this.hex = hex;
    Object.freeze(this);
  }

  toString(): string { return this.hex; }
  equals(other: ObjectId): boolean { return other.hex === this.hex; }
}
```

**Entities** — Identity and lifecycle

```typescript
class Replica {
  private readonly id: ReplicaId;
  private readonly clock: ClockPort;
  private readonly log: Op[] = [];

  constructor(id: string, clock: ClockPort) {
    this.id = ReplicaId.from(id);
    this.clock = clock;
  }

  append(op: Op): string {
    this.log.push(op);
    return this.clock.tick();
  }
}
```

**Results and Outcomes** — Runtime-backed domain types, not tagged unions

```typescript
class OpApplied {
  readonly op: Op;
  readonly timestamp: string;

  constructor(op: Op, timestamp: string) {
    this.op = op;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}

class OpSuperseded {
  readonly op: Op;
  readonly winner: EventId;

  constructor(op: Op, winner: EventId) {
    this.op = op;
    this.winner = winner;
    Object.freeze(this);
  }
}

// Runtime dispatch — not tag switching
if (outcome instanceof OpSuperseded) {
  return outcome.winner;
}
```

**Errors** — Domain failures are first-class objects

```typescript
class InvalidObjectId extends DomainError {
  readonly value: string;

  constructor(value: string) {
    super(`Invalid object ID: ${value.slice(0, 16)}…`);
    this.name = 'InvalidObjectId';
    this.value = value;
  }
}

// Branch on type
if (err instanceof InvalidObjectId) { /* ... */ }

// NEVER parse messages
if (err.message.includes('invalid')) { /* raccoon-in-a-dumpster energy */ }
```

### Principles

These are the load-bearing architectural commitments. Violating any of these is a design-level issue.

**P1: Domain Concepts Require Runtime-Backed Forms**
If a concept has invariants, identity, or behavior, it must have a runtime-backed representation — a class. An interface or type alias is insufficient.

```typescript
// Shape trust — nothing enforces this at runtime
interface EventId { writerId: string; lamport: number; }

// Runtime-backed — invariants established on construction
class EventId {
  readonly writerId: WriterId;
  readonly lamport: Lamport;

  constructor(writerId: string, lamport: number) {
    this.writerId = WriterId.from(writerId);
    this.lamport = Lamport.from(lamport);
    Object.freeze(this);
  }
}
```

**P2: Validation Happens at Boundaries and Construction Points**
Untrusted input becomes trusted data only through constructors or dedicated parse methods. Constructors establish invariants; they perform no I/O or async work.

```typescript
// Boundary: raw bytes → validated domain object
const decoded = cborDecode(bytes);
const parsed = EventIdSchema.parse(decoded);
const eventId = new EventId(parsed.writerId, parsed.lamport);
```

**P3: Behavior Belongs on the Type That Owns It**
Avoid switching on `kind`/`type` tags. Put behavior on the owning type.

```typescript
// External switch on tags
function describe(outcome: { type: string }): string {
  switch (outcome.type) {
    case 'applied': return `Applied`;
    case 'superseded': return `Beaten`;
  }
}

// Behavior lives on the type
class OpApplied {
  describe(): string { return `Applied at ${this.timestamp}`; }
}

class OpSuperseded {
  describe(): string { return `Beaten by ${this.winner}`; }
}
```

**P4: Schemas Belong at Boundaries, Not in the Core**
Use schemas (e.g., Zod) to reject malformed input at the edge. Domain types own behavior and invariants inside the boundary.

**P5: Serialization Is the Codec's Problem**
The byte layer (CBOR/JSON/etc.) stays separate from the meaning layer. Domain types do not know how they are encoded.

**P6: Single Source of Truth**
The runtime model is the source. TypeScript types reflect it. Tests prove it. Documentation explains it. Nothing duplicates it.

**P7: Runtime Dispatch Over Tag Switching**
Inside a coherent runtime, `instanceof` is the correct dispatch mechanism.

**Cross-realm note:** `instanceof` breaks across realm boundaries (iframes, web workers, multiple module instances). When values cross realms, use branding:

```typescript
class EventId {
  static readonly brand = Symbol.for('flyingrobots.EventId');
  get [EventId.brand](): true { return true; }
  static is(v: unknown): v is EventId {
    return v != null && (v as Record<symbol, unknown>)[EventId.brand] === true;
  }
}
```

### Practices

These are concrete coding disciplines. Most are linter-enforceable. Violations should fail CI.

- **`any` is banished.** No exceptions. No `as any`. No generic defaults to `any`. No `Function` type. If you cannot type it, you haven't understood it yet.
- **`unknown` is banished.** Raw data enters through parsers that return concrete types or throw. The parser is the boundary, not the call site.
- **`as` is banished.** Type assertions bypass the compiler. Use runtime guards, discriminated classes, or parser functions instead. The compiler should follow your runtime logic, not be overridden by your wishes.
- **`interface` is for ports only.** Ports (abstract contracts between layers) use `interface`. Domain concepts use `class`. If it has invariants, identity, or behavior, it is a class.
- **Trusted values must preserve integrity** — Use `Object.freeze()`, `readonly`, or `private` fields to protect invariants after construction.
- **Error type is primary; codes are optional metadata** — Use specific error classes. Never branch on `err.message`.
- **Parameter objects must add semantic value** — Public APIs should not accept anonymous bags of options.

```typescript
// Options sludge
await replayer.replay(segment, { allowFork: true, maxRetries: 3, strict: false });

// Named policy
const policy = ReplayPolicy.speculativeForkAllowed({ maxRetries: 3 });
await replayer.replaySegment(segment, policy);
```

- **Raw objects may carry bytes, not meaning** — Plain objects are for decoded payloads or logging only.
- **Magic numbers and strings are banished** — Give semantic numbers a named constant.
- **Boolean trap parameters are banished** — Use named parameter objects or separate methods.
- **One thing per file.** "Where is Foo?" → open `Foo.ts` → find Foo. Done. Every class, every domain type, every meaningful export lives in a file named after it. Re-export shims that forward from a monolith are not splits — they are lies about where code lives. If the file is named after the class, the class definition must be in that file.
- **No `enum`.** TypeScript enums are runtime objects with surprising behavior. Use `as const` objects or class hierarchies.

```typescript
// WRONG — TypeScript enum (reverse mapping, numeric default, surprising equality)
enum OpType { NodeAdd, NodeRemove }

// RIGHT — const object
const OP_TYPE = { NODE_ADD: 'NodeAdd', NODE_REMOVE: 'NodeRemove' } as const;
type OpType = typeof OP_TYPE[keyof typeof OP_TYPE];

// BEST — class hierarchy (when behavior differs per variant)
abstract class Op { abstract apply(state: State): State; }
class NodeAdd extends Op { /* ... */ }
class NodeRemove extends Op { /* ... */ }
```

### Tooling Discipline

**Lint is law.**

- Lint errors fail CI.
- Suppressions require a documented justification.
- Enforce hardest on: `any` leakage, floating promises, raw `Error` objects, and host-specific API leakage into core code.

**TypeScript compiler flags:**

- `strict: true` — the baseline, non-negotiable.
- `noUncheckedIndexedAccess: true` — forces handling of potentially undefined index access.
- `exactOptionalPropertyTypes: true` — distinguishes `undefined` from missing.
- `noPropertyAccessFromIndexSignature: true` — makes index signature access explicit.
- `noUnusedLocals`, `noUnusedParameters` — dead code is noise.
- `noImplicitReturns`, `noFallthroughCasesInSwitch` — control flow honesty.

**ESLint rules (non-negotiable):**

- `@typescript-eslint/no-explicit-any: error` — the `any` ban.
- `@typescript-eslint/no-unsafe-assignment: error` — no `any` propagation.
- `@typescript-eslint/no-unsafe-member-access: error`
- `@typescript-eslint/no-unsafe-return: error`
- `@typescript-eslint/no-unsafe-call: error`
- `@typescript-eslint/switch-exhaustiveness-check: error`
- `@typescript-eslint/only-throw-error: error`
- `@typescript-eslint/no-unnecessary-type-assertion: error`

The `no-unsafe-*` rules that were disabled in the JSDoc JS era are **re-enabled**. In TypeScript, they catch real bugs.

### The Anti-Shape-Soup Doctrine

Most bad TypeScript infrastructure stems from weak modeling. The discipline is:

1. Name the concept.
2. Construct the concept — with validated invariants.
3. Protect the invariant — freeze, encapsulate, defend.
4. Attach the behavior — on the type that owns it.
5. Guard the boundary — schemas at the edge, domain types inside.
6. Separate the codec — serialization is not the domain's problem.
7. Isolate the host — Node behind adapters, core stays portable.
8. Type the runtime — TypeScript documents what actually exists.
9. Test the truth — executable specification, not wishful coverage.

### Review Checklist

Before merging, ask:

- What is actually true at runtime, and which runtime object proves it?
- Does this follow hexagonal architecture?
- Are concrete dependencies injected rather than constructed in core?
- Is encoding or decoding restricted to adapters, codec ports, or named
  boundary readers?
- Is this a real domain concept? Where is its runtime-backed class?
- Are there any `any`, `unknown`, or `as` in the diff?
- Does construction establish trust?
- Does behavior live on the type that owns it?
- Is anyone parsing `err.message` instead of branching on typed errors?
- Are there magic numbers or strings?
- Could this logic run in a browser?
- Is there an `interface` that should be a `class`?
- Is there a type assertion that should be a runtime guard?

**This is infrastructure.** Types are documentation that the compiler can check. Runtime truth beats compile-time certainty every time — but now the compiler is on our side.
