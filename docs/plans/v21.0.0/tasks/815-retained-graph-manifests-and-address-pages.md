---
id: "#815"
issue: "#815"
slug: "815-retained-graph-manifests-and-address-pages"
title: "Define retained graph manifests and bounded ordinal address pages"
type: "Feature"
wave: 0
workstream: "W3"
status: "open-frontier"
prerequisites: []
unlocks: ["#816", "#819"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #815 (#815: Define retained graph manifests and bounded ordinal address pages) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (none) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Domain nouns and CAS page codecs for retained manifests, geometry, dictionaries, and address pages.) and exclude out-of-scope work (Roaring bitmap selection plane (#816) and full-state contract deletion (#814).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Goalpost #824 replaces the full-state replay basis (which hit the 5 MiB CBOR ceiling on a 23.9 MB state) with an immutable retained graph manifest and bounded ordinal-to-CAS address pages.

## 2. Problem Description

Resuming retained state currently requires loading a single monolithic state.cbor replay basis into memory.

## 2b. Proposed Solution

Define runtime-backed RetainedGraphManifest, OrdinalGeometry, IdentifierDictionary, and OrdinalAddressPage domain classes backed by bounded git-cas pages and deterministic commitments.

## 2c. Alternatives considered and rejected

- Raise the 5 MiB CBOR decoder ceiling: rejected by the v21.0.0 exit invariant in docs/plans/v21.0.0/README.md.

## 2d. Acceptance Criteria

- [ ] An ordinal is meaningful only together with its RetainedGraphManifest.
- [ ] Deterministic rebuilds produce byte-identical dictionaries and manifests.
- [ ] Resolving one ordinal opens only its bounded address page.
- [ ] Missing or wrong-kind payload handles fail closed with a typed WarpError.

## 2e. Test Plan

Golden: Build a retained manifest across multiple ordinal pages, reopen it from CAS, and resolve individual ordinals without loading sibling pages.

Edges: Missing/wrong-kind roots, page byte/item limits, segmented geometry overflow, and duplicate ordinal rejection.

Known failure modes: Corrupt page CBOR or out-of-range ordinal throws a typed domain error.

Fuzz and stress: Generated ordinal growth across page boundaries under a fixed Docker heap budget.

## 3. Prerequisites

- [x] None (root contract front)

## 4. Scope

In: Domain nouns and CAS page codecs for retained manifests, geometry, dictionaries, and address pages.

Out: Roaring bitmap selection plane (#816) and full-state contract deletion (#814).

## 5. Why now

Root Wave 0 prerequisite for the entire #815 -> #816 -> #817 -> #248 -> #814 chain and #819 recursive references.

## 6. Risks

Must align cleanly with the cone record keys and digests landed in #1062 and planned in #1044.

## 7. Definition of Done

- [ ] 100% unit test coverage on new manifest/page classes and green Docker suite.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#815](https://github.com/git-stunts/git-warp/issues/815)
- Directly unlocks: `#816`, `#819`
