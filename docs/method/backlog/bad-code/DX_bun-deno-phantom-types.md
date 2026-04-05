# BunHttpAdapter/DenoHttpAdapter reference undeclared global types

**Effort:** S

## Problem

JSDoc references `BunServer`, `BunServeOptions`, `DenoServerState`, etc.
that don't exist as imports or local typedefs. `tsc` sees `any` for
these types, silently losing type safety at adapter boundaries.

## Suggested Fix

Declare local `@typedef` for each runtime-specific type, or use
`@type {*}` with an explanatory comment noting the type is
runtime-provided and unavailable to tsc.
