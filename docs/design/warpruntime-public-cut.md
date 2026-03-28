# WarpRuntime Public Cut

Status: DESIGN

Legend: Observer Geometry

Cycle: OG-010

## Why

`WarpApp` / `WarpCore` only solves the public API problem if the old public
root noun actually disappears. Keeping `WarpRuntime` around as a public alias
continues teaching a flat API surface and invites consumers to treat the
product-facing and plumbing-facing layers as interchangeable.

For `v15`, we are already making a deliberate major-version cut. This is the
right moment to remove the public `WarpRuntime` export entirely.

## Decision

For `v15`:

- `WarpApp` is the default export and the primary product-facing root
- `WarpCore` is the named plumbing/tooling root
- `WarpRuntime` is not exported from the package entry point
- front-door docs and type surface stop teaching `WarpRuntime`

The internal engine may continue to live in `src/domain/WarpRuntime.js`
temporarily. This slice is about the public contract, not internal file churn.

## Consequences

- consumers must move public imports from `WarpRuntime` to `WarpCore`
- `WarpApp` remains the first-use API for app builders and agentic consumers
- `warp-ttd` and other substrate-honest tooling should target `WarpCore`
- docs/tests/manifests must stop implying a compatibility transition

## Non-Goals

- renaming the internal runtime implementation file in the same slice
- finishing the `Strand` vs `Strand` noun decision
- shipping a web documentation site in the same slice
