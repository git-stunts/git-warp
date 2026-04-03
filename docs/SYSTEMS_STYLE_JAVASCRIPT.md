# System-Style JavaScript

**How to write JavaScript infrastructure that lasts.**

This is the engineering standard for **`git-stunts`** and all **`flyingrobots`** repositories. It is **not** a conventional style guide about semicolons, quotes, or formatting trivia. It is a doctrine for writing JavaScript infrastructure code that remains honest under execution, replay, migration, debugging, replication, failure, and time.

### Rule 0: Runtime Truth Wins

When the program is running, one question matters above all others:

**What is actually true right now, in memory, under execution?**

If the answer depends on comments, conventions, vanished types, wishful thinking, or editor vibes, the code is lying.

Trusted domain values must be created through runtime construction, parsing, or validation that establishes their invariants. Once established, those invariants must be preserved for as long as the value remains trusted.

This rule outranks documentation, build steps, editor hints, static overlays, compile-time tooling, team folklore, and "but the linter said it was fine."

### What This Means in Practice

Infrastructure cannot afford fake contracts:

- A type that vanishes at runtime is not an authoritative contract.
- A comment describing a shape is not an authoritative contract.
- A plain object that "should" have valid fields is not an authoritative contract.
- An IDE tooltip is not an authoritative contract.
- A compile step is not an authoritative contract.

These tools can be useful. None of them outrank the runtime.

### Why It Matters Here

Infrastructure code touches persistence, replication, cryptographic verification, conflict resolution, deterministic replay, failure handling, system boundaries, long-lived state, version migration, and auditability. This is not view-layer glue. Mushy assumptions here turn into real bugs with long half-lives.

### The Hierarchy of Truth

When layers disagree, authority flows in this order:

1. **Runtime domain model** — constructors, invariants, methods, error types
2. **Boundary schemas and parsers** — Zod, CBOR decoders, protocol validators
3. **Tests** — the executable specification
4. **JSDoc and design docs** — human-facing explanations of the runtime model
5. **IDE and static tooling** — editor navigation, refactoring support
6. **TypeScript** — useful dialect, not final authority

### Scope

This standard is optimized for:

- Infrastructure code with strong invariants
- Long-lived systems with explicit boundaries
- Direct execution workflows portable across hosts
- Browser-capable cores
- JavaScript-first repositories
- Code that must be teachable, legible, and publishable

It is not a claim that every JavaScript project should follow this exact approach. It **is** a claim that, for this family of repositories, runtime-backed domain modeling beats soft shape trust.

### Language Policy

#### JavaScript Is the Default

JavaScript is chosen deliberately. It is not perfect — parts of it are cursed and deserve open mockery — but it offers a rare combination:

- Fast to write and change
- Highly portable
- Backed by a flexible object model
- Direct to execute
- Expressive enough for serious infrastructure
- Widely understood

Many of these projects are built not just to run, but to be read, explained, taught from, and used as reference implementations. JavaScript lowers the barrier to entry for readers in a way few other languages can match. That readability is not a side benefit — it is part of the design.

Fun matters too. A language that feels pleasant to iterate in yields tighter feedback loops, more experiments, and more finished work. That is sound engineering economics.

#### TypeScript: Allowed, Not Authoritative

TypeScript is a useful typed dialect that improves editor workflows, refactoring, and external compatibility. What this standard rejects is elevating TypeScript to the role of final authority.

TypeScript may help with editor navigation, consumer ergonomics, and static checks. It does **not** replace runtime validation, preserve runtime invariants, or excuse weak domain modeling.

The true sources of truth remain the runtime domain types, boundary parsing, and tests. **TypeScript is allowed. TypeScript is not king.**

Use TypeScript where it helps. Never confuse it with the source of truth.

#### Escape Hatch: Rust via WebAssembly

When JavaScript is insufficient — tight CPU-bound loops, memory-sensitive systems, unsafe parsing of hostile binary inputs, cryptographic kernels — use Rust.

Rust provides memory safety without garbage collection, explicit ownership, excellent performance, and strong WebAssembly support. It is the recommended companion when the problem outgrows JavaScript.

**Preferred architecture split:**

| Layer                    | Language          | Role                                      |
|--------------------------|-------------------|-------------------------------------------|
| Core domain logic        | JavaScript        | Default. Portable. Browser-ready.         |
| Performance-critical kernels | Rust → Wasm    | When safety/speed constraints justify it  |
| Host adapters            | JavaScript        | Node, Deno, browser — behind ports        |
| Orchestration            | JavaScript        | Glue between cores and hosts              |

### Architecture

#### Browser-First Portability

The browser is the most universal deployment platform and the ultimate portability test. Core logic prefers web-platform-friendly primitives:

```javascript
// ✅ Portable
const bytes = new TextEncoder().encode(text);
const arr = new Uint8Array(buffer);
const url = new URL(path, base);

// ❌ Node-only — belongs in adapters
const buf = Buffer.from(text, 'utf8');
const resolved = require('path').resolve(p);
```

#### Hexagonal Architecture Is Mandatory

Core domain logic must never depend directly on Node globals, filesystem APIs, `process`, `Buffer`, or host-specific calls. Those belong behind adapter ports.

**Core rule:** Core logic should not know that Node exists. Node-only facilities must remain exclusively in adapter implementations.

```javascript
// ✅ Core speaks in portable terms
class ReplicaEngine {
  constructor(storage, clock, codec) {
    // storage, clock, codec are ports — capabilities, not implementations
    this._storage = storage;
    this._clock = clock;
    this._codec = codec;
  }

  async applyOp(op) {
    const timestamp = this._clock.now();
    const bytes = this._codec.encode(op);
    await this._storage.put(op.key, bytes, timestamp);
  }
}

// ✅ Adapter implements the port for a specific host
class NodeFsStorageAdapter {
  async put(key, bytes, timestamp) {
    const filePath = path.join(this._root, key);
    await fs.writeFile(filePath, bytes);
  }
}

// ✅ Browser adapter implements the same port
class IndexedDbStorageAdapter {
  async put(key, bytes, timestamp) {
    const tx = this._db.transaction('store', 'readwrite');
    await tx.objectStore('store').put({ key, bytes, timestamp });
  }
}
```

### The Object Model

System-style JavaScript organizes code around four categories of **runtime-backed** objects:

**Value Objects** — Meaningful domain values with invariants

```javascript
class ObjectId {
  constructor(hex) {
    if (typeof hex !== 'string' || !/^[0-9a-f]{40,64}$/.test(hex)) {
      throw new InvalidObjectId(hex);
    }
    this._hex = hex;
    Object.freeze(this);
  }

  toString() { return this._hex; }
  equals(other) { return other instanceof ObjectId && other._hex === this._hex; }
}
```

**Entities** — Identity and lifecycle

```javascript
class Replica {
  constructor(id, clock) {
    this._id = ReplicaId.from(id);
    this._clock = clock;
    this._log = [];
  }

  append(op) {
    const validated = Op.from(op); // boundary validation
    this._log.push(validated);
    return this._clock.tick();
  }
}
```

**Results and Outcomes** — Runtime-backed domain types, not tagged unions

```javascript
class OpApplied {
  constructor(op, timestamp) {
    this.op = op;
    this.timestamp = timestamp;
    Object.freeze(this);
  }
}

class OpSuperseded {
  constructor(op, winner) {
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

```javascript
class InvalidObjectId extends DomainError {
  constructor(value) {
    super(`Invalid object ID: ${typeof value === 'string' ? value.slice(0, 16) + '…' : typeof value}`);
    this.name = 'InvalidObjectId';
    this.value = value;
  }
}

// ✅ Branch on type
if (err instanceof InvalidObjectId) { /* ... */ }

// ❌ Never parse messages
if (err.message.includes('invalid')) { /* raccoon-in-a-dumpster energy */ }
```

### Principles

These are the load-bearing architectural commitments. Violating any of these is a design-level issue.

**P1: Domain Concepts Require Runtime-Backed Forms**
If a concept has invariants, identity, or behavior, it must have a runtime-backed representation — usually a class. A typedef or plain object is insufficient.

```javascript
// ❌ Shape trust — nothing enforces this at runtime
/** @typedef {{ writerId: string, lamport: number }} EventId */

// ✅ Runtime-backed — invariants established on construction
class EventId {
  constructor(writerId, lamport) {
    this._writerId = WriterId.from(writerId);
    this._lamport = Lamport.from(lamport);
    Object.freeze(this);
  }
}
```

**P2: Validation Happens at Boundaries and Construction Points**
Untrusted input becomes trusted data only through constructors or dedicated parse methods. Constructors establish invariants; they perform no I/O or async work.

```javascript
// Boundary: raw bytes → validated domain object
const decoded = cborDecode(bytes);
const parsed = EventIdSchema.parse(decoded);     // schema rejects malformed input
const eventId = new EventId(parsed.writerId, parsed.lamport); // constructor establishes invariants
```

**P3: Behavior Belongs on the Type That Owns It**
Avoid switching on `kind`/`type` tags. Put behavior on the owning type.

```javascript
// ❌ External switch on tags
function describe(outcome) {
  switch (outcome.type) {
    case 'applied': return `Applied at ${outcome.timestamp}`;
    case 'superseded': return `Beaten by ${outcome.winner}`;
  }
}

// ✅ Behavior lives on the type
class OpApplied {
  describe() { return `Applied at ${this.timestamp}`; }
}

class OpSuperseded {
  describe() { return `Beaten by ${this.winner}`; }
}
```

**P4: Schemas Belong at Boundaries, Not in the Core**
Use schemas (e.g., Zod) to reject malformed input at the edge. Domain types own behavior and invariants inside the boundary.

```javascript
// ✅ Edge: schema validates untrusted input
const ReplicaConfigSchema = z.object({
  id: z.string().uuid(),
  maxLogSize: z.number().int().positive(),
});

// ✅ Core: domain type provides behavior
class ReplicaConfig {
  constructor(id, maxLogSize) {
    this._id = ReplicaId.from(id);
    this._maxLogSize = maxLogSize;
    Object.freeze(this);
  }

  allowsAppend(currentSize) {
    return currentSize < this._maxLogSize;
  }
}

// ✅ Boundary glue
function parseReplicaConfig(raw) {
  const data = ReplicaConfigSchema.parse(raw);
  return new ReplicaConfig(data.id, data.maxLogSize);
}
```

**P5: Serialization Is the Codec's Problem**
The byte layer (CBOR/JSON/etc.) stays separate from the meaning layer. Domain types do not know how they are encoded.

```javascript
// ✅ Codec handles the wire format
class EventCodec {
  encode(event) {
    return cborEncode({
      writerId: event.writerId.toString(),
      lamport: event.lamport.value,
      payload: event.payload,
    });
  }

  decode(bytes) {
    const raw = cborDecode(bytes);
    return new Event(
      WriterId.from(raw.writerId),
      Lamport.from(raw.lamport),
      raw.payload
    );
  }
}
```

**P6: Single Source of Truth**
Do not duplicate the same contract across JSDoc, TypeScript, and validators. Define the runtime model first. Everything else derives from or documents it.

**P7: Runtime Dispatch Over Tag Switching**
Inside a coherent runtime, `instanceof` is often the correct dispatch mechanism.

```javascript
// ✅ Direct dispatch
if (outcome instanceof OpSuperseded) {
  return outcome.winner;
}

// ✅ Policy objects instead of option flags
const replayPolicy = ReplayPolicy.speculativeForkAllowed();
const result = await replayer.replaySegment(segment, replayPolicy);
```

**Cross-realm note:** `instanceof` breaks across realm boundaries (iframes, web workers, multiple module instances). When values cross realms, use branding instead:

```javascript
class EventId {
  static _brand = Symbol.for('flyingrobots.EventId');
  get [EventId._brand]() { return true; }
  static is(v) { return v != null && v[EventId._brand] === true; }
}
```

### Practices

These are concrete coding disciplines. Most are linter-enforceable. Violations should fail CI.

- **`any` is banished; `unknown` is quarantined** — `any` is surrender. `unknown` is acceptable only at raw edges and must be eliminated through parsing immediately.
- **Trusted values must preserve integrity** — Use `Object.freeze()`, private fields, or defensive copying to protect invariants after construction.
- **Error type is primary; codes are optional metadata** — Use specific error classes. Never branch on `err.message`. Error codes are fine as boundary metadata.
- **Parameter objects must add semantic value** — Public APIs should not accept anonymous bags of options.

```javascript
// ❌ Options sludge
await replayer.replay(segment, { allowFork: true, maxRetries: 3, strict: false });

// ✅ Named policy
const policy = ReplayPolicy.speculativeForkAllowed({ maxRetries: 3 });
await replayer.replaySegment(segment, policy);
```

- **Raw objects may carry bytes, not meaning** — Plain objects are for decoded payloads or logging only.
- **Magic numbers and strings are banished** — Give semantic numbers a named constant. Centralize strings used for identifiers, events, or config keys.
- **Boolean trap parameters are banished** — Use named parameter objects or separate methods.

```javascript
// ❌ What does `true` mean here?
engine.compact(log, true);

// ✅ Intention is legible
engine.compact(log, { preserveTombstones: true });
// or
engine.compactPreservingTombstones(log);
```

- **Structured data stays structured** — Machines must not be forced to parse prose to recover data.
- **Module scope is the first privacy boundary** — If it is not exported, it is private.
- **JSDoc documents the runtime model; it does not replace it** — JSDoc explains actual runtime behavior and contracts. It must never substitute for runtime-backed types or validation.

### Tooling Discipline

**Lint is law.**

- Lint errors fail CI.
- Suppressions require a documented justification.
- Enforce hardest on: unsafe coercion, floating promises, raw `Error` objects, and host-specific API leakage into core code.

**When TypeScript is used:**

- It remains subordinate to runtime validation.
- It must not be treated as a substitute for domain modeling.
- `any` is banned. `unknown` at raw edges only, eliminated immediately.
- Type-only constructs must not create a false sense of safety that the runtime does not back up.

### The Anti-Shape-Soup Doctrine

Most bad JavaScript infrastructure stems from weak modeling. The discipline is:

1. Name the concept.
2. Construct the concept — with validated invariants.
3. Protect the invariant — freeze, encapsulate, defend.
4. Attach the behavior — on the type that owns it.
5. Guard the boundary — schemas at the edge, domain types inside.
6. Separate the codec — serialization is not the domain's problem.
7. Isolate the host — Node behind adapters, core stays portable.
8. Document the runtime — JSDoc explains what actually exists.
9. Test the truth — executable specification, not wishful coverage.

### Review Checklist

Before merging, ask:

- Is this a real domain concept? Where is its runtime-backed form?
- Where is `unknown` eliminated?
- Does construction establish trust?
- Does behavior live on the type that owns it?
- Is anyone parsing `err.message` like a raccoon in a dumpster?
- Are there magic numbers or strings?
- Could this logic run in a browser?
- Is tooling fiction being mistaken for architecture?

**This is infrastructure.** Code cannot rely on costumes or pretend that comments are contracts. JavaScript is enough — not because it is magical, but because runtime truth beats phantom certainty every time.
