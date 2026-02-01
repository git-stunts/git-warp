# Evolution of Query Architecture for @git-stunts/empty-graph

**Project:** `@git-stunts/empty-graph`
**Date:** January 29, 2026
**Subject:** From Imperative Traversals to Functional Pipeable Operators

---

## 1. Executive Summary

This document traces the architectural evolution of the query layer for `empty-graph`. We began by evaluating industry-standard declarative languages (**Cypher/SPARQL**), transitioned into a proposed fluent **LINQ-inspired DSL**, and ultimately landed on a **Functional Pipeable Operator** architecture.

**The Conclusion:** While a monolithic DSL is aesthetically pleasing, a functional pipeable architecture best honors the project's existing async-generator-based services while providing the highest performance-to-effort ratio for handling large-scale Git DAGs.

---

## 2. Phase I: Market Standard Analysis

We initially analyzed the feasibility of mapping the specialized Git DAG model to established graph query languages.

### 2.1 Cypher & SPARQL Assessment

- **Cypher (Neo4j):** Highly intuitive for property graphs but assumes mutable data and typed relationships. Our DAG lacks native relationship properties on Git edges, creating a model mismatch.
- **SPARQL (RDF):** Treats graphs as triples (Subject-Predicate-Object). Supporting this would require high-overhead triple-index shards or slow on-the-fly generation.
- **Verdict:** Both were abandoned due to significant architectural mismatch risks and high implementation effort ($4–16$ weeks).
    

---

## 3. Phase II: The LINQ-Inspired DSL (EmptyQL)

Recognizing the need for a tailored solution, we proposed **EmptyQL**, a deferred-execution engine mirroring .NET's LINQ.

### 3.1 Design Goals

- **Deferred Execution:** Build an operation stack that only executes upon terminal calls like `.toArray()`.
- **Predicate Push-down:** Use the `BitmapIndexReader` to filter by indexed fields (author, type) before loading any commit bodies.
- **Lazy Hydration:** Load and parse JSON payloads (`WarpGraph.readNode`) only for nodes that pass index filters.
    

### 3.2 Key Insight from Source Code

Reviewing `WarpGraph.js` and `TraversalService.js` revealed that the system already uses `AbortSignal` for stream cancellation and `async generators` for $O(1)$ memory efficiency. Any query engine _must_ preserve these capabilities to avoid OOM errors on graphs with $1M+$ nodes.

---

## 4. Phase III: The Final Pivot – Pipeable Operators

The final architectural decision moved away from a monolithic `QueryBuilder` class in favor of **Functional Pipeable Operators**.

### 4.1 Why Pipes won "Gemini's Gut™"

1. **Direct Generator Mapping:** Your existing `iterateNodes` and `bfs` return async generators. Pipes act directly on these streams without a "black box" query planner.
2. **Explicit Hydration Control:** Loading commit messages via `persistence.showNode` is the primary I/O bottleneck. Pipes allow developers to explicitly place `lazyHydrate()` in the chain, ensuring I/O only occurs at the optimal moment.
3. **Lean Core:** It utilizes small, testable utility functions rather than an over-abstracted class hierarchy.
    

### 4.2 Recommended Architecture

```javascript
// The Final Recommended Architecture in Action
const results = await collect(
  pipe(
    graph.traversal.ancestors({ sha: 'HEAD' }), // 1. O(1) traversal (SHA only)
    filterByIndex({ type: 'order' }),           // 2. Index-only filter
    lazyHydrate(graph),                         // 3. Explicit I/O bottleneck
    filterByPayload(n => n.data.amount > 100),  // 4. Content filter
    limit(10)                                   // 5. Early stream termination
  )
);
```

---

## 5. Strategic Roadmap

|**Phase**|**Task**|**Effort**|**Value**|
|---|---|---|---|
|**Current**|**Functional Pipes (MVP)**|1-3 Days|**Very High**|
|**Short-Term**|**Index-Aware Operators**|1 Week|High|
|**Mid-Term**|**GraphStatistics Collector**|2 Weeks|Medium|
|**Long-Term**|**LINQ-Style Wrapper**|3 Weeks|UX Only|

**Prepared by:** @flyingrobots

**Source Materials:** `WarpGraph.js`, `TraversalService.js`, `StreamingBitmapIndexBuilder.js`.
