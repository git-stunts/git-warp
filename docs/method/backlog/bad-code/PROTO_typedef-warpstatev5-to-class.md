# Promote WarpStateV5 from @typedef to class

**Effort:** L

## Problem

`src/domain/services/JoinReducer.js` defines `WarpStateV5` as a
`@typedef {Object}`. This is the core CRDT materialized state —
constructed, cloned, mutated by all apply paths, checkpointed, and
serialized. Large blast radius; many consumers.
