---
id: "#819"
issue: "#819"
slug: "819-typed-recursive-warp-graph-references"
title: "Add typed recursive WARP graph attachment references"
type: "Feature"
wave: 1
workstream: "W4"
status: "blocked"
prerequisites: ["#815", "#903 (merged)"]
unlocks: ["#820", "#821"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #819 (#819: Add typed recursive WARP graph attachment references) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#815, #903 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (GraphReference domain classes, codecs, and resolver port interfaces.) and exclude out-of-scope work (Cycle-safe multi-hop recursive traversal (#820) and CAS GC/doctor retention (#821).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Part of Goalpost #905. Implements the recursive ownership semantics defined in #903 over #815's retained manifest contract.

## 2. Problem Description

Nodes and edges can attach byte streams (#818), but cannot attach typed pinned or live references to child WARP graphs with explicit structural ownership.

## 2b. Proposed Solution

Add runtime-backed GraphReference (owned pinned child coordinate vs. external live locator) domain nouns, validation rules, and resolver port contracts.

## 2c. Alternatives considered and rejected

- Encode child graph names as untyped string properties: rejected because retention, cycle detection, and migration cannot distinguish owned child graphs from strings.

## 2d. Acceptance Criteria

- [ ] GraphReference distinguishes finite structural ownership (pinned child coordinate/manifest) from external live links.
- [ ] Deleting or overwriting an owned reference preserves descendant history per #903.

## 2e. Test Plan

Golden: Attach a pinned child graph reference and a live graph locator to a parent node, persist, and resolve both through the typed boundary.

Edges: Self-reference, invalid child graph name, and missing child coordinate.

Known failure modes: Unvalidated or malformed reference descriptor throws a dedicated WarpError subclass.

Fuzz and stress: Property tests over valid and invalid graph reference descriptors.

## 3. Prerequisites

- [ ] `#815`
- [x] `#903 (merged)`

## 4. Scope

In: GraphReference domain classes, codecs, and resolver port interfaces.

Out: Cycle-safe multi-hop recursive traversal (#820) and CAS GC/doctor retention (#821).

## 5. Why now

Unlocked in Wave 1 once #815 lands; unblocks #820, #821, and #822.

## 6. Risks

Must respect the public-surface guard (#1050) and Optic read model.

## 7. Definition of Done

- [ ] 100% coverage on new reference classes and #819 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#819](https://github.com/git-stunts/git-warp/issues/819)
- Directly unlocks: `#820`, `#821`
