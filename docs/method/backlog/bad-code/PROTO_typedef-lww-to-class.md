# Promote LWWRegister from @typedef to class

**Effort:** S

## Problem

`src/domain/crdt/LWW.js` defines `LWWRegister` as a `@typedef {Object}`
but it has semilattice merge semantics (`lwwMax`) and setter logic (`lwwSet`).
Should be a class.
