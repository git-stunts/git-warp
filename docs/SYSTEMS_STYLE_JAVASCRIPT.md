# Systems-Style JavaScript

How to write JavaScript for infrastructure that lasts.

This document is the engineering standard for `@git-stunts/git-warp`
and all `git-stunts` / `flyingrobots` repositories. It is not a style
guide — it is a set of structural decisions that determine whether the
code is honest or lying.

---

## The core premise

JavaScript is a real programming language. It has classes, inheritance,
`instanceof`, constructors, and proper encapsulation via module scope.
It does not need TypeScript's phantom type system to be safe. It needs
discipline.

**Every domain concept is a class.** If you're writing a `@typedef`,
stop. If you're returning a plain object `{ target, result }`, stop.
If you're writing `normalizeX(unknown)`, stop. You are building a
class. Build the class.

---

## The rules

### 1. Classes, not typedefs

A `@typedef {Object}` is a lie. It exists only at type-check time. It
provides no runtime validation, no `instanceof`, no constructor, no
methods. It is a comment pretending to be a contract.

```javascript
// BAD — phantom type, vanishes at runtime
/** @typedef {Object} Dot
 *  @property {string} writerId
 *  @property {number} counter */
function createDot(writerId, counter) {
  return { writerId, counter };
}

// GOOD — real class, validates, exists at runtime
class Dot {
  constructor(writerId, counter) {
    if (typeof writerId !== 'string' || writerId.length === 0) {
      throw new Error('writerId must be a non-empty string');
    }
    if (!Number.isInteger(counter) || counter <= 0) {
      throw new Error('counter must be a positive integer');
    }
    this.writerId = writerId;
    this.counter = counter;
  }
}
```

The class IS the validation. The constructor IS the normalizer. The
instance IS the proof that the data is good.

### 2. Validation lives in constructors

If you have a function called `normalizeX()`, `assertX()`, or
`validateX()` that takes `unknown` and returns a known type — that
function is a constructor. It validates input, produces a trusted
output, and the caller uses the output downstream. That is what
constructors do.

```javascript
// BAD — standalone validator, trusted output is a plain object
function normalizeLamportCeiling(value, field) {
  if (value === null || value === undefined) { return null; }
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be non-negative integer`);
  }
  return value;
}

// GOOD — value object, validated on construction
class LamportCeiling {
  constructor(value) {
    if (value !== null && (!Number.isInteger(value) || value < 0)) {
      throw new Error('LamportCeiling must be null or non-negative integer');
    }
    this.value = value;
  }
}
```

After `new LamportCeiling(x)` succeeds, you never check the value
again. The constructor did the work. Every consumer trusts the instance.

### 3. Subclasses, not switches

If you're writing `if (x.kind === 'live') ... else if (x.kind ===
'strand') ...`, you have a class hierarchy hiding behind a string
discriminant. The dispatch logic belongs in the class, not in every
consumer.

```javascript
// BAD — every consumer switches on kind
function resolve(selector) {
  if (selector.kind === 'live') {
    return resolveLive(selector);
  }
  if (selector.kind === 'strand') {
    return resolveStrand(selector);
  }
}

// GOOD — the selector resolves itself
class LiveSelector extends NormalizedSelector {
  async resolve(graph, scope, liveFrontier) {
    // resolution logic lives here
  }
}

class StrandSelector extends NormalizedSelector {
  async resolve(graph, scope) {
    // resolution logic lives here
  }
}

// Consumer just calls:
const result = await selector.resolve(graph, scope, liveFrontier);
```

One call. No switch. The subclass knows what it is. If you add a new
kind, you add a new subclass — you don't hunt for every switch
statement in the codebase.

### 4. `instanceof` is the runtime type check

JavaScript has `instanceof`. Use it. It works at runtime. It survives
serialization boundaries when you reconstruct from the right class. It
is honest.

```javascript
// BAD — checking a string tag
if (outcome.result === 'superseded') {
  console.log(outcome.reason);
}

// GOOD — checking the actual type
if (outcome instanceof OpSuperseded) {
  console.log(outcome.winner.writerId);
}
```

`instanceof` tells you what the object IS. String comparison tells you
what the object CLAIMS to be.

### 5. `unknown` means you haven't built the class yet

If a function parameter is typed `unknown`, that function is admitting
it doesn't know what it's working with. At system boundaries (CBOR
decode, network input, user input), `unknown` is honest. Everywhere
else, it is a sign that the class hasn't been written yet.

The fix is always the same: define the class, construct it at the
boundary, and pass the instance downstream.

```javascript
// BAD — unknown flows through the whole pipeline
function processRecord(record) {  // record is unknown
  const type = record['recordType'];  // bracket access, no safety
  const id = record['recordId'];      // more bracket access
  // ...
}

// GOOD — construct at boundary, trust everywhere after
const record = new TrustRecord(zodParsed.data);  // validates
processRecord(record);  // record.recordType is a real field
```

### 6. Factory functions are backward-compat shims

If a factory function (`createDot`, `createEventId`) exists alongside
a class, the factory is a shim for callers that haven't updated yet.
New code uses the constructor directly. Factories delegate to
constructors — they never contain logic.

```javascript
// Factory is a one-liner that delegates
function createDot(writerId, counter) {
  return new Dot(writerId, counter);
}
```

If the factory contains validation, transformation, or branching that
the constructor doesn't, the constructor is incomplete.

### 7. Serialization is the codec's problem

CBOR key ordering, JSON canonicalization, and wire format concerns do
not belong in class field declarations. The codec sorts keys at encode
time. Classes declare fields in whatever order makes domain sense.

```javascript
// BAD — fields ordered alphabetically for CBOR
class Dot {
  counter;   // alphabetical, not logical
  writerId;  // alphabetical, not logical
}

// GOOD — fields ordered by domain meaning
class Dot {
  writerId;  // who created this operation
  counter;   // which operation from that writer
}
```

The CBOR codec runs `Object.keys(obj).sort()` before encoding. The
class doesn't know or care about serialization order.

### 8. Structured data, not formatted strings

If a string contains structured information (who won, at what lamport,
from which writer), that string is a class that got flattened. Extract
the structure.

```javascript
// BAD — structured data encoded as a string
return {
  target: key,
  result: 'superseded',
  reason: `LWW: writer ${winner.writerId} at lamport ${winner.lamport} wins`,
};

// GOOD — structured data as fields
return new OpSuperseded(key, winner);
// winner is an EventId instance — structured, inspectable, programmatic
```

Strings are for humans. Fields are for machines. If a machine needs
to read the data, it should be a field.

### 9. Errors are domain classes

`new Error('something went wrong')` is a raw error. It has no code,
no context, no machine-readable identity. Domain errors are classes
that extend `WarpError` with a `code` field, a `context` object, and
a `name` that supports `instanceof`.

```javascript
// BAD
throw new Error('Backfill rejected');

// GOOD
throw new ForkError('Backfill rejected', {
  code: 'E_FORK_BACKFILL_REJECTED',
  context: { writerId, relation, ckHead },
});
```

Every `new Error()` in domain code is a bug. Every catch site that
parses `err.message` is a bug. Use the class.

### 10. The module is the encapsulation boundary

JavaScript doesn't have `private` at the language level (private
fields `#x` exist but have proxy/testing friction). The module is
the encapsulation boundary. If a function or class is not exported,
it is private. If it is exported, it is public.

Don't fake privacy with naming conventions (`_privateMethod`) when
module scope provides it for free. Export what consumers need. Keep
everything else module-private.

---

## What this eliminates

When every rule is followed, the following patterns disappear from
the codebase:

- `@typedef {Object}` for any constructable concept
- `normalizeX(unknown)` standalone validator functions
- `assertX(unknown)` standalone guard functions
- `if (x.kind === 'foo')` dispatch switches (subclasses handle it)
- `Record<string, unknown>` as a function parameter type
- `/** @type {X} */ (plainObject)` cast-to-shut-up patterns
- Raw `new Error()` in domain code
- Formatted strings carrying structured data
- Bracket access `obj['field']` on known shapes

What remains is classes, constructors, `instanceof`, and module scope.
That's JavaScript. That's enough.

---

## This is infrastructure

`git-warp` is a multi-writer CRDT graph database. It stores data as
Git commits. It runs on Node, Bun, and Deno. It handles cryptographic
verification, distributed replication, and deterministic replay.

This is not a React component. This is not a REST API handler. This
is infrastructure. The code must be honest, inspectable, and safe at
runtime — not just at type-check time.

TypeScript's phantom types vanish at runtime. JavaScript classes exist
at runtime. For infrastructure, that difference is everything.
