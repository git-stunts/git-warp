# M1–M3 Tasks Checklist

> This checklist is the execution contract for Milestones 1–3. Keep it updated as tasks complete.

## Global DoD
- [x] All JSON output is canonical and stable (sorted ordering)
- [x] Determinism test passes (double-run identical JSON)
- [x] No API ambiguity (match/select/labelFilter semantics exactly as specified)
- [x] Docs include 3 runnable examples: 2-hop query, shortestPath, CLI query+path

---

## Milestone 1 — Fluent Query Builder (MVP)

### M1.1 graph.query() builder
- [x] Implement fluent builder: match → where → outgoing/incoming → select → run
- [x] Enforce match(pattern: string) only; non-string throws E_QUERY_MATCH_TYPE
- [x] Define multi-hop semantics: each hop operates on current working set
- [x] where() filters nodes only; predicate receives read-only snapshot
- [x] Predicate snapshot uses plain objects/arrays (no live Maps)
- [x] Run auto-materializes (M0.1)
- [x] Determinism: node sets canonical sort by id each step
- [x] Edge snapshot ordering canonical: (label, peerId)
- [x] Tests: two-hop traversal, chaining order matters, mutation does not affect results

### M1.2 Pattern matching (nodeId glob)
- [x] match supports glob string (case-sensitive)
- [x] Define wildcard semantics for *
- [x] Tests: user:* matches all user nodes; * matches all

### M1.3 Result shaping (DTO)
- [x] Default QueryResult DTO: { stateHash, nodes: [{ id, props? }] }
- [x] select(['id','props']) only; unknown field throws E_QUERY_SELECT_FIELD
- [x] select([]) treated same as default (select not called)
- [x] Deterministic output ordering (nodes sorted by id)
- [x] Tests: select fields, unknown field error, default shape

---

## Milestone 2 — Built-in Graph Traversal

### M2.1 graph.traverse module
- [x] Implement bfs, dfs, shortestPath (unweighted), connectedComponent
- [x] dir enum: 'out' | 'in' | 'both'
- [x] labelFilter: string | string[]
- [x] labelFilter semantics: array = OR; empty array = none; undefined = all
- [x] Deterministic neighbor expansion order: (neighborId, label)
- [x] Deterministic shortestPath tie-break via canonical order
- [x] Tests: visit order, tie-break stability, labelFilter semantics

### M2.2 Shared adjacency cache (materialized state owned)
- [x] Materialize returns/stores MaterializedGraph with adjacency + stateHash
- [x] Query/traverse consume MaterializedGraph adjacency
- [x] Cache bounded (configurable cap)
- [x] Tests: reuse adjacency for same stateHash; eviction under cap

### M2.3 Naming cleanup: logical vs Git DAG
- [x] Rename Git DAG traversal to CommitDagTraversal*
- [x] Keep deprecated alias for 1 minor version
- [x] Update exports/imports/comments for clarity

---

## Milestone 3 — CLI Tool (warp-graph)

### M3.1 CLI skeleton
- [x] CLI entrypoint + routing (info, query, path, history, check)
- [x] Flags: --repo, --json (all commands)
- [x] Exit codes: 0 ok, 1 usage/config, 2 not found/no path, 3 internal

### M3.2 Reuse query + traversal
- [x] CLI query calls M1.1 builder
- [x] CLI path calls M2.1 shortestPath
- [x] Human output derived from JSON

### M3.3 Health & GC visibility
- [x] 30-min audit of existing health/GC metrics
- [x] If missing: scope to checkpoint freshness + writer heads + tombstone counts
- [x] Surface in CLI check output (JSON first)

### M3.4 CLI history definition (MVP)
- [x] history --writer <id> shows writer patch chain
- [x] optional: --node <nodeId> best-effort filter

---

## Docs
- [x] Add 3 runnable examples (2-hop query, shortestPath, CLI query+path)

---

## Extras (post-DoD)
- [x] Add CLI smoke tests (info, query, path, history, check)
- [x] Tighten CLI info output (writer counts + checkpoint/coverage when scoped)
