# OpV2 types are typedef phantoms with external tag dispatch

**Effort:** L

## What's Wrong

`WarpTypesV2.js` defines 8 op types (NodeAdd, NodeRemove, EdgeAdd,
EdgeRemove, PropSet, NodePropSet, EdgePropSet, BlobValue) as `@typedef`
plus factory functions. No constructor validation. External code uses
`op.type === 'NodeAdd'` string switching everywhere.

This is a P1 + P3 + P7 violation: domain concepts without runtime
identity, behavior externalized into switch statements, and tag
dispatch instead of `instanceof`.

## Suggested Fix

Class hierarchy with a base `Op` class. Each op type is a subclass with
constructor validation. Replace string switching with `instanceof`
dispatch. Factory functions become constructors.
