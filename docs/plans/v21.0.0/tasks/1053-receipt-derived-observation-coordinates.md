---
id: "#1053"
issue: "#1053"
slug: "1053-receipt-derived-observation-coordinates"
title: "Receipt-derived observation Coordinate for replay, re-ask, fork, and strand settlement"
type: "Feature"
wave: 2
workstream: "W1"
status: "blocked"
prerequisites: ["#1052-3b", "#1072", "#1049 (merged)", "#1067 (merged)"]
unlocks: ["#1055"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #1053 (#1053: Receipt-derived observation Coordinate for replay, re-ask, fork, and strand settlement) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#1052-3b, #1072, #1049 (merged), #1067 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Public Coordinate parse/toString wiring, Optic replay/at, cone-based fork, strand overlays, settlement (#968-#970), and GC survival tests.) and exclude out-of-scope work (Newcomer guide and annotations showcase migration (#1055) and legacy Runtime/Lane deletion (#1054).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Implements Sections 7-8 of the accepted Optic contract (#1049/#1059) and re-scopes #968, #969, and #970 onto the cone-based Strand journey from PR #1040 (commits 256c3ed4f, 1cb02dda4, 7210e649b).

## 2. Problem Description

Callers need to replay a past write or read receipt across restarts and git gc, re-ask a new question at the same historical basis, fork a strand from an observation Coordinate, fork a strand from an existing strand (#968), preserve strand overlay author identity (#969), and settle strands after the target advances (#970).

## 2b. Proposed Solution

Expose opaque receipt-derived Coordinate (parse/toString), add Optic(view).replay(coord) and Optic(view).at(coord) with rights/coarsening checks, and wire cone-based fork, strand overlays, and footprint-records/v1 settlement.

## 2c. Alternatives considered and rejected

- Expose raw writer frontiers or checkpoint SHAs in Coordinate: rejected because it leaks writer identities and violates the opaque Coordinate rule.

## 2d. Acceptance Criteria

- [ ] Write or read, restart process, run git gc --prune=now, and replay the receipt's Coordinate: the returned receipt is byte-identical.
- [ ] Optic(view).at(coord) answers a new question at the same basis, honoring observer/purpose equality or strict coarsening.
- [ ] Forking from a Coordinate records observer, question, and purpose in strand provenance; strand-from-strand fork (#968), overlay author identity (#969), and settlement after target advance (#970) pass with zero whole-state trap hits.

## 2e. Test Plan

Golden: Execute a write, obtain its Coordinate, fork a strand, write on the strand while main advances, preview settlement, settle onto main, and replay the original Coordinate after git gc --prune=now.

Edges: Revoked observer rights on replay, disallowed purpose widening on re-ask, and conflicting strand settlement.

Known failure modes: Tampered or unretained Coordinate returns a typed refusal/unavailable-evidence receipt without throwing raw internal errors.

Fuzz and stress: Strand overlay equivalence oracle comparing cone-based strand reads and settlements against full reduction.

## 3. Prerequisites

- [ ] `#1052-3b`
- [ ] `#1072`
- [x] `#1049 (merged)`
- [x] `#1067 (merged)`

## 4. Scope

In: Public Coordinate parse/toString wiring, Optic replay/at, cone-based fork, strand overlays, settlement (#968-#970), and GC survival tests.

Out: Newcomer guide and annotations showcase migration (#1055) and legacy Runtime/Lane deletion (#1054).

## 5. Why now

Wave 2 critical-path bridge between #1052 reads and #1055/#1054 cutover.

## 6. Risks

Replay must never re-execute a write intent or recapture a newer frontier.

## 7. Definition of Done

- [ ] All #1053, #968, #969, and #970 acceptance checks pass with 100% coverage on touched files.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1053](https://github.com/git-stunts/git-warp/issues/1053)
- Directly unlocks: `#1055`
