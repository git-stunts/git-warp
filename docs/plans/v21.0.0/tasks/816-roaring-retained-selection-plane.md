---
id: "#816"
issue: "#816"
slug: "816-roaring-retained-selection-plane"
title: "Remix Roaring bitmap indexes as the retained-state selection plane"
type: "Feature"
wave: 1
workstream: "W3"
status: "blocked"
prerequisites: ["#815", "#192"]
unlocks: ["#817", "#820"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #816 (#816: Remix Roaring bitmap indexes as the retained-state selection plane) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#815, #192) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Roaring selection plane readers and flushable builders over #815 manifests and #192 typed shards.) and exclude out-of-scope work (Streaming causal reduction (#817) and recursive child traversal (#820).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Part of Goalpost #824. Builds on #815's retained graph manifests and #192's typed index boundary.

## 2. Problem Description

Global label, property, and adjacency selection still depends on full-state materialization or legacy byte-shard bridges.

## 2b. Proposed Solution

Use Roaring bitmap indexes over #815's graph-local ordinals as the retained selection plane for alive nodes, alive edges, labels, indexed properties, and adjacency.

## 2c. Alternatives considered and rejected

- Scan all address pages linearly for property filters: rejected because global selection must use bitmap intersections before opening payload pages.

## 2d. Acceptance Criteria

- [ ] Selection queries intersect Roaring bitmaps and open only matching ordinal address pages.
- [ ] Builders flush bounded bitmap shards without holding the complete graph in memory.

## 2e. Test Plan

Golden: Query nodes by label and property across a multi-page retained manifest and verify only matching address pages are read.

Edges: Empty bitmap intersection, high-cardinality property values, and Wasm bitmap bounds validation.

Known failure modes: Corrupt bitmap shard fails closed with a typed error.

Fuzz and stress: Random boolean combinations of label/property filters compared against reference set intersection.

## 3. Prerequisites

- [ ] `#815`
- [ ] `#192`

## 4. Scope

In: Roaring selection plane readers and flushable builders over #815 manifests and #192 typed shards.

Out: Streaming causal reduction (#817) and recursive child traversal (#820).

## 5. Why now

Wave 1 link in the #815 -> #816 -> #817 -> #248 -> #814 chain.

## 6. Risks

Enforce roaring-wasm memory and deserialization guards.

## 7. Definition of Done

- [ ] 100% coverage on new selection-plane modules and green Docker test suite.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#816](https://github.com/git-stunts/git-warp/issues/816)
- Directly unlocks: `#817`, `#820`
