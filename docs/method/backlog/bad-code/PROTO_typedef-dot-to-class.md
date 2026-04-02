# Promote Dot from @typedef to class

**Effort:** XS

## Problem

`src/domain/crdt/Dot.js` defines `Dot` as a `@typedef {Object}` but it
has factory (`createDot`), encode/decode, and comparison functions. Should
be a class with those as methods.
