# Public surface guard

Implementation plan for [#1050](https://github.com/git-stunts/git-warp/issues/1050).
The [accepted Optic contract](./optic-only-public-api.md), sections 2 and 9,
defines the capability boundary. The implementation and operating limits are
documented in [Public capability guard](../operations/public-surface.md).

## Outcome

Every executable package export participates in one public-capability check.
New forbidden capabilities fail; removing a legacy capability also requires
removing its allowance. Existing public APIs continue to work until #1054 removes
them after their replacements land.

## Entry points and analysis

Read the actual `package.json` exports map, including conditional branches and
fallback arrays. Repeated targets may share compiler work, but diagnostics retain
their public subpath. Explicit JSON data exports are not executable capabilities.
Malformed, missing, unresolved, or unsupported executable targets fail closed;
they are not silently skipped.

Use the existing TypeScript compiler to resolve exports and aliases. Inspect
runtime export names and their declaration targets, then walk public declaration
types: class instances and statics, inherited public members, callable and
constructor parameters/results, unions/intersections, generic arguments,
constraints, index values, and declared conditional/mapped type branches.
Private/protected members and implementation bodies are not public reachability.
An iterative worklist and canonical generic declarations terminate recursive
types while their concrete arguments remain traversed. Named analysis bounds prevent an unbounded graph walk;
exceeding the bound is a failed analysis, never an empty successful result.

Executable JavaScript targets must have the corresponding generated declaration
surface. A runtime export missing from that surface is an analysis failure.
The guard is a static capability check, not proof of arbitrary dynamic JavaScript
behavior or a replacement for published-consumer/runtime tests.

Match the forbidden application vocabulary on exposed names, including alias
targets, members, and literal API discriminants. Graph-shaped question plans
remain legal; the mutable graph nouns `Graph`, `WarpGraph`, and `WarpCore` do not.
An opaque `Coordinate` remains legal only with hidden construction and the
specified parse/serialize surface. Its name is not a blanket exemption for
frontier, cut, basis, or checkpoint members.

## Ratchet and enforcement

Keep a reviewed text inventory of exact legacy violations, each with the child
issue responsible for removal. Identity uses stable public/source names rather
than line numbers or an aggregate count. New violations, duplicate allowances,
invalid removal owners, and stale allowances fail the check.

The Docker unit suite checks the current built package against that inventory.
A separate CI comparison rejects allowance additions against the PR merge base,
using the existing full-history static lane. Missing comparison history fails
closed. Initial introduction is explicit: the baseline and guard must both be
absent throughout the comparison base's reachable history. Later disappearance
of the baseline, including deletion of the guard with it, cannot reset the ratchet.

The existing root vocabulary check remains in place. This slice does not remove
legacy exports, implement the target Warp/Optic API, change package versions,
or introduce another compiler dependency.

## Acceptance evidence

- Enumerate a new conditional/subpath export without editing a hand-maintained list.
- Reject forbidden runtime and type aliases, inherited members, returned objects,
  callbacks, generic containers, and public constructor inputs.
- Permit private implementation nouns, ordinary prose, graph-shaped question
  plans, and an opaque Coordinate with its allowed operations.
- Refuse unresolved targets and incomplete analysis; prove cycle termination.
- Fail for both an unlisted violation and an allowance whose violation disappeared.
- Reject ratchet growth at the merge base, including growth hidden in a later
  commit; permit removal and the explicit first introduction.
- Run deterministic RED/GREEN fixtures and the actual package witness in COPY
  Docker, then normal hooks, policy/lint/type gates, and independent PR review.

The implementation will receive the normal typed tooling lint caps. Validation
reuses the existing guarded worker, output budget, and dependency cache.
