# Doctrine/runtime alignment ratchet

This guardrail defines when `git-warp` docs may run ahead of runtime
implementation and what evidence is required before a noun, API, or semantic
promise can be treated as settled.

The rule is simple: docs may name the target, but only runtime evidence can
make the target current.

## Status labels

Use the same status words as [GLOSSARY.md](GLOSSARY.md):

- **shipped**: implemented runtime behavior with public or internal consumers,
  executable tests, and docs that describe it as current behavior.
- **transition**: partially implemented behavior or vocabulary that exists in
  runtime but still carries compatibility, migration, or naming debt.
- **target**: intended doctrine or design direction that is not yet a complete
  runtime contract.
- **historical**: archived or superseded material retained as evidence, not as
  current guidance.

Public docs may teach `shipped` and `transition` behavior as usable current
surfaces. They must not describe `target` behavior as already available.

## Allowed docs-ahead posture

Doctrine and design notes may run ahead of implementation when all of these are
true:

- the stronger claim is marked `target` or `transition`
- the doc links to either [WARP_DRIFT.md](audits/WARP_DRIFT.md), a design note,
  or a GitHub Issue that owns the runtime work
- public product docs preserve the current runtime behavior while naming the
  stronger target as future or in-progress work
- release notes do not list the target as shipped until runtime evidence exists

If those conditions are not met, the doc is not aspirational design; it is
runtime drift.

## Runtime evidence

A noun, API, or semantic promise moves from `target` to `transition` or
`shipped` only when the repository contains inspectable runtime evidence:

- a runtime-backed exported noun, domain class, port, command, or adapter
- constructor, parser, or boundary validation for its important invariants
- behavior tests or conformance tests for the claimed semantics
- docs that point to the same noun and use the correct status label
- a GitHub Issue, design note, or drift-ledger row for remaining gaps
- public API cost posture when the surface is exported

Tests are not optional decoration. If a future reader cannot replay the
evidence locally, the status has not ratcheted.

## Major noun checklist

Before treating a major public noun as settled:

- add or update its [GLOSSARY.md](GLOSSARY.md) row
- mark it `shipped`, `transition`, or `target`
- connect any gap to [WARP_DRIFT.md](audits/WARP_DRIFT.md) or a GitHub Issue
- add executable coverage for the runtime behavior that carries the noun
- make public docs say whether the noun is current runtime truth or target
  doctrine

This applies to worldlines, coordinates, observers, optics, strands, braids,
suffix transport, holograms, admission shells, and future WARP nouns.

## Release rule

A release may include doctrine that is ahead of runtime, but the release must
make that posture visible. Changelogs, guides, and API references must separate
`shipped`, `transition`, and `target` claims before the release is cut.

When in doubt, keep the target in design or audit docs and make the public API
docs smaller until runtime evidence catches up.
