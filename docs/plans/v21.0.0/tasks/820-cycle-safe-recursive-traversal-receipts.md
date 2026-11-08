---
id: "#820"
issue: "#820"
slug: "820-cycle-safe-recursive-traversal-receipts"
title: "Traverse recursive WARP graphs with cycle-safe bounded receipts"
type: "Feature"
wave: 2
workstream: "W4"
status: "blocked"
prerequisites: ["#816", "#819", "#903 (merged)"]
unlocks: ["#822"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #820 (#820: Traverse recursive WARP graphs with cycle-safe bounded receipts) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#816, #819, #903 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Recursive traversal engine, cycle detector, and recursive receipt evidence.) and exclude out-of-scope work (CAS GC retention and doctor diagnostics for recursive references (#821).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Part of Goalpost #905. Consumes #819's typed GraphReference nouns and #816's indexed selection.

## 2. Problem Description

Traversing across parent-to-child graph references can loop infinitely on external cycles or blow memory if child graphs are fully materialized.

## 2b. Proposed Solution

Implement cycle-safe, budget-bounded recursive traversal over indexed child roots, recording each resolved child basis and cycle cut in the traversal receipt.

## 2c. Alternatives considered and rejected

- Forbid cycles across external live locators: rejected because live locators can form cycles dynamically and must be handled safely at read time.

## 2d. Acceptance Criteria

- [ ] Shared children and cyclic external locators terminate deterministically under declared ReadBudget limits.
- [ ] Each resolved child graph uses bounded indexed selection without full child materialization.
- [ ] Traversal receipts record every visited child coordinate and cycle cut.

## 2e. Test Plan

Golden: Traverse a 3-graph hierarchy containing a shared diamond child and an external cycle, verifying complete receipt evidence and bounded memory.

Edges: Self-looping live locator, missing child graph target, and budget exhaustion on deep recursion.

Known failure modes: Unresolvable child reference produces a typed obstruction in the receipt.

Fuzz and stress: Random directed graph topologies (trees, DAGs, cyclic graphs) verifying termination within budget.

## 3. Prerequisites

- [ ] `#816`
- [ ] `#819`
- [x] `#903 (merged)`

## 4. Scope

In: Recursive traversal engine, cycle detector, and recursive receipt evidence.

Out: CAS GC retention and doctor diagnostics for recursive references (#821).

## 5. Why now

Wave 2 task unlocked by #816 and #819; required before #822 migration verification.

## 6. Risks

Ensure observer rights and purpose are checked at each child graph boundary.

## 7. Definition of Done

- [ ] 100% coverage on recursive traversal modules and green Docker suite.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#820](https://github.com/git-stunts/git-warp/issues/820)
- Directly unlocks: `#822`
