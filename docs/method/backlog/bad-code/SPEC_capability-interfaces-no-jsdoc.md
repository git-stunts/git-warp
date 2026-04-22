---
id: SPEC_capability-interfaces-no-jsdoc
blocked_by: []
blocks: []
feature: docs-dx
---

# Capability interfaces lack JSDoc on individual methods

**Effort:** M
**Audit ref:** CQ01-2.1

The 9 capability abstract classes (`QueryCapability`, `PatchCapability`,
`MaterializeCapability`, etc.) have method signatures with underscore-
prefixed parameter names and no inline docs.

A consumer reading `PatchCapability` gets method signatures but no
behavioral contract — no description of what each method does, what
it returns, or what errors it may throw.

## Suggested Fix

Add JSDoc with `@description`, `@param`, `@returns`, and `@throws` to
every public method on the 9 capability abstract classes. These are
the primary API surface for v17+ consumers.
