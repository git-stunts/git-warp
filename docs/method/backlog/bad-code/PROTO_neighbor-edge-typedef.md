# NeighborEdge and Direction are typedef-only domain concepts

**Effort:** S

## Problem

`NeighborProviderPort.js` defines `Direction` (`'out'|'in'|'both'`) and
`NeighborEdge` (`{neighborId, label}`) as `@typedef`. Direction passes
through the system without runtime validation. NeighborEdge is a domain
value object that deserves constructor guarantees.

## Suggested Fix

Promote `NeighborEdge` to a class with constructor validation. Consider
`Direction` as an enum-like constant object with a validation function.
