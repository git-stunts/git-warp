---
id: PROTO_capability-port-protocol
blocked_by: []
blocks: []
---

# Capability ports as a first-class protocol

**Effort:** L

## Idea

Ports in this codebase are abstract classes with `throw new Error('not
implemented')` in every method. They exist to be extended, never
instantiated. But `requireCapabilities` already proved we don't need
inheritance — we just need proof that an object has the right methods.

What if ports were defined as capability specs instead of classes?

```js
const CorePersistenceSpec = new PortSpec({
  readRef:      '(ref: string) => Promise<string | null>',
  updateRef:    '(ref: string, newOid: string, oldOid: string | null) => Promise<void>',
  readBlob:     '(oid: string) => Promise<Uint8Array>',
  // ...
});
```

An adapter doesn't extend a class — it just satisfies the spec:

```js
CorePersistenceSpec.validate(myAdapter);  // throws with missing/wrong methods
CorePersistenceSpec.satisfiedBy(myAdapter);  // returns boolean
```

No `instanceof`. No inheritance chains. No abstract methods that exist
only to throw. The spec IS the contract. You can compose specs:
`PortSpec.merge(ReadSpec, WriteSpec, RefSpec)`. You can subset them:
`ReadSpec = CorePersistenceSpec.pick('readRef', 'readBlob')`.

This is the logical conclusion of the `requireCapabilities` direction.
Ports become declarative contracts validated at runtime. Adapters become
any object that passes validation. The inheritance hierarchy dissolves
into pure structural typing — but with runtime enforcement, not just
TypeScript hope.

## Why cool

Every time we add a method to `GraphPersistencePort` and forget to add
it to a mock, we get a runtime error three layers deep. With capability
specs, the mock would fail validation at construction. The contract is
explicit, composable, and machine-checkable — without any of the
baggage of class inheritance.
