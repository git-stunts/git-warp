---
id: ARCH_agent-source-change-guard-for-doc-only-cycles
blocked_by: []
blocks: []
feature: testing-quality
release_home: v18.0.0
---

# Source-change guard for doc-only cycles

**Effort:** S

## Idea

Doc-only/design cycles currently rely on agent discipline to avoid
production source changes. A small opt-in guard could prove that a cycle
touched no `src/**` files.

## Why Cool

This would make process constraints executable. During cycles like 0097,
an agent could run a guard that fails if production source changed,
making "no source edits" more than a promise in chat.

## Sketch

- Add a script or conformance helper that compares changed files against
  a base ref or explicit file list.
- Fail if `src/**` changed during a doc-only cycle.
- Document when to use it in design cycles.
- Keep it opt-in unless global enforcement becomes useful.

## Acceptance

- Add a conformance check or script that can assert a cycle touched no
  `src/**` files.
- Document how agents should use it in doc-only cycles.
- Consider making it part of design-cycle validation.
- Keep it opt-in if global enforcement would be too rigid.
