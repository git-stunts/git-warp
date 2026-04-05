# Op types as a class hierarchy — the biggest P1 win

**Effort:** L

## Idea

`WarpTypesV2` defines 8 op types as typedefs with factory functions.
Every consumer does `if (op.type === 'NodeAdd')` — string-based tag
switching, the exact anti-pattern that P1, P3, and P7 were written to
prevent. This is the single largest doctrine violation in the codebase,
and it touches everything: JoinReducer, OpNormalizer, PatchBuilderV2,
TickReceipt, the diff engine.

Imagine instead:

```js
class Op {
  constructor(dot) {
    if (!dot || !(dot instanceof Dot)) {
      throw new Error('Op requires a valid Dot');
    }
    this.dot = dot;
    Object.freeze(this);
  }
}

class NodeAdd extends Op {
  constructor(nodeId, dot) {
    super(dot);
    if (typeof nodeId !== 'string' || nodeId.length === 0) {
      throw new Error('NodeAdd requires a non-empty nodeId');
    }
    this.nodeId = nodeId;
    Object.freeze(this);
  }
}
```

JoinReducer switches from `if (op.type === 'NodeAdd')` to `if (op
instanceof NodeAdd)` — no strings, no tags, no `switch` statements.
Each op class owns its own validation: dot is a real `Dot`, nodeId is
a non-empty string, edgeKey components contain no reserved bytes. The
constructor is the invariant boundary.

The OpNormalizer becomes a method on the class: `op.toCanonical()`
returns the canonical form, `Op.fromRaw(rawOp)` parses raw wire format
into the correct subclass. Serialization stays in the codec (P5) — the
op doesn't know how it's encoded, but it does know how to normalize
itself.

TickReceipt's `OP_TYPES` enum dissolves. The receipt stores the op
instance directly. `receipt.ops.filter(op => op instanceof EdgePropSet)`
is cleaner than `receipt.ops.filter(op => op.type === 'EdgePropSet')`.

## Why cool

This is the refactor that would most improve the domain model's runtime
honesty. Eight typedefs become eight classes. Dozens of string
comparisons become `instanceof` checks. Validation moves from "hope the
factory was called correctly" to "the constructor rejects bad input."
The entire op pipeline — build, normalize, apply, record — gets
type-safe at runtime, not just in JSDoc comments. This is what the
systems-style manifesto was written for.
