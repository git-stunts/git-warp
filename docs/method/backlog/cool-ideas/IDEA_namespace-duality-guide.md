# Namespace duality guide: flat vs architectural access

The `WarpGraph` capability bag supports two access patterns:

- **Flat**: `graph.patches`, `graph.query`, `graph.materialize`
- **Architectural**: `graph.commitment.patches`, `graph.folding.materialize`

Document this as a deliberate design feature. The flat form is for
quick scripts and exploration; the architectural form is for code
that wants to be explicit about which admission moment it's in.

A short "Namespace Guide" doc would explain why both exist, when to
prefer each, and how they map to the admission kernel theory.
