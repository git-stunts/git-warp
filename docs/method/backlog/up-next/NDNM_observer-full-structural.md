# Grow Observer toward full structural observer

**Effort:** L

## Problem

The `Observer` class implements only the projection component `O` of
the full structural observer `S = (O, B, M, K, E)` defined in OG-I
(Def. 3). It has no basis, accumulation, or emission structure.

This is not a misname — it's an incomplete implementation. The class
correctly projects histories into filtered views. It does not yet
support:

- Native basis `B` (which distinctions are primitive)
- Accumulation state `M` and update rule `K` (building descriptions
  over time)
- Emission map `E` (producing accumulated descriptions)

## Fix

Additive — grow the Observer class with optional basis and
accumulation capabilities. No rename needed. Not a breaking change.

## Source

Cycle 0006 noun audit (R3).
