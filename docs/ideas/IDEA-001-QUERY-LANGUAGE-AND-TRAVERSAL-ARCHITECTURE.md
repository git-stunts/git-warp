# Query Language & Traversal Architecture

**Project:** `@git-stunts/empty-graph`
**Date:** January 29, 2026
**Subject:** Feasibility Analysis of Declarative Query Support (Cypher/SPARQL) vs. Custom DSL Implementation

## 1. Executive Summary

This report evaluates the path forward for querying the `@git-stunts/empty-graph` Directed Acyclic Graph (DAG). While the system currently possesses strong low-level traversal capabilities, it lacks a high-level declarative query interface. We analyzed the feasibility of adopting industry standards like **Cypher** and **SPARQL** versus developing a custom domain-specific language (**WarpQL**).

> [!important]
> **Key Finding:** Adopting full Cypher or SPARQL introduces significant architectural mismatch risks due to WarpGraph's specialized immutable commit-based model. 
> 
> **We recommend a phased approach**: immediate implementation of functional predicate filtering, followed by the development of a tailored fluent DSL.

---

## 2. Current State Assessment: Traversal Capabilities

The `TraversalService.js` provides a high-performance foundation utilizing $O(1)$ bitmap index lookups and memory-efficient async generators.

### Existing Algorithms

|**Algorithm**|**Description**|**Complexity**|
|---|---|---|
|**BFS / DFS**|Breadth/Depth-first with depth tracking|$O(V+E)$|
|**Shortest Path**|Bidirectional BFS for optimized search|$O(b^{d/2})$|
|**Dijkstra / A***|Weighted and heuristic-guided traversal|$O((V+E) \log V)$|
|**Topological Sort**|Kahn’s algorithm with cycle detection|$O(V+E)$|

---

## 3. Query Language Support Analysis

### 3.1 Cypher (Neo4j) Integration

Cypher is highly intuitive for property graphs but assumes a mutable environment with typed relationships.

- **Mapping:** Git commits map directly to nodes; parent-child edges map to relationships.
- **Feasibility:** Variable-length paths (`-[:PARENT*1..5]->`) are straightforward. However, properties on edges and relationship types are not natively supported in the current DAG model.
- **Recommendation:** Use `cypher-parser` only if Neo4j ecosystem compatibility is a strict requirement. Otherwise, the effort ($4-8$ weeks) outweighs the value.

### 3.2 SPARQL (RDF) Integration

SPARQL treats the graph as a series of (Subject, Predicate, Object) triples.

- **Model Fit:** Poor. WarpGraph is optimized for parent/child lookups, not arbitrary predicate queries.
- **Risk:** Requires either slow on-the-fly triple generation or a significant storage overhead for a triple-index shard.
- **Recommendation:** Not recommended ($8-16$ weeks effort).

---

## 4. Proposed Alternative: WarpQL (Custom DSL)

A fluent, chainable API tailored to the strengths of Git-based DAGs. This approach leverages the `BitmapIndexReader` directly.

### Design Philosophy

1. **Selective Filtering:** Push predicates as close to the traversal start as possible.
2. **Lazy Evaluation:** Load commit messages/JSON payloads only when required by a filter.
3. **Temporal Awareness:** Built-in support for date-range and time-windowed aggregation.

### Sample Syntax (WarpQL)

```javascript
const orders = await graph.query()
  .pattern('(user)-parent*1..3->(order)')
  .where({
    user: n => n.event.type === 'UserCreated',
    order: n => n.event.type === 'OrderPlaced'
  })
  .orderBy('date', 'desc')
  .execute();
```

---

## 5. Cost-Based Optimization Logic

To maintain performance at scale ($1M+$ nodes), a custom query planner must be implemented.

- **Cardinality Estimation:** Use sampled graph statistics (average branching factor) to estimate the cost of `forward` vs. `reverse` traversals.
- **Predicate Push-down:** Analyze `WHERE` clauses to identify indexable prefix lookups before starting a full BFS.

---

## 6. Strategic Recommendations & Roadmap

### Phase 1: Immediate Value (Low Effort)

- Integrate `predicate` functions directly into `TraversalService.js`.
- Implement temporal helpers: `findInDateRange()` and `aggregateByTimeWindow()`.

### Phase 2: Structural Evolution (Medium Effort)

- Develop the **WarpQL** fluent API.
- Build a **GraphStatistics** collector to provide metadata for the query planner.

### Phase 3: Advanced Querying (High Effort)

- Develop a cost-based Query Planner.
- (Optional) Implement a Cypher-subset parser for familiar syntax support.

---

### Comparison Summary

|**Option**|**Effort**|**Value**|**Recommendation**|
|---|---|---|---|
|**Custom Predicates**|1-3 Days|High|**Implement Immediately**|
|**WarpQL DSL**|2-4 Weeks|Very High|**Primary Target**|
|**Cypher Subset**|4-8 Weeks|Medium|**Consider for UX Only**|
|**SPARQL**|8-16 Weeks|Low|**Abandon**|

---

**Prepared by:** @flyingrobots
**Source Materials:** `libcypher-parser`, `sparqljs`, `TraversalService.js` codebase.

---

# RFC 006: WarpQL – A LINQ-Inspired Query Engine

- **Author:** James Ross / Gemini
    
- **Status:** Draft / Request for Comments
    
- **Target Version:** 2.0.0-alpha
    
- **Dependencies:** `WarpGraph`, `TraversalService`, `BitmapIndexReader`
    

---

## 1. Abstract

This RFC proposes **WarpQL**, a declarative, deferred-execution query engine for `@git-stunts/empty-graph`. By adopting a LINQ-inspired fluent API, we aim to decouple query intent from traversal implementation. This engine will leverage existing async generators to provide O(1) memory overhead and utilize "predicate push-down" to exploit the bitmap indexing layer for high-speed filtering.

## 2. Motivation

The current imperative approach requires developers to manually orchestrate `TraversalService.bfs` or `WarpGraph.iterateNodes`. While flexible, common patterns—such as "find the last 5 orders from this user"—require redundant logic for filtering, depth management, and data hydration.

WarpQL will address:

- **Optimization Mismatch:** Currently, filters are often applied _after_ expensive `GraphNode` hydration.
    
- **Boilerplate:** Standardizing path discovery and temporal windowing.
    
- **Developer Ergonomics:** Moving from "how to walk the graph" to "what data to retrieve."
    

## 3. Technical Design

### 3.1 The Query Provider (Deferred Execution)

WarpQL implements a "Builder" that accumulates an operation stack. No Git operations or I/O are performed until a terminal method (e.g., `.toArray()`, `.first()`) is called.

### 3.2 Core Pipeline Stages

The engine will execute queries in three distinct cost-weighted phases:

1. **Index Phase (Low Cost):** Uses `BitmapIndexReader` and `TraversalService` to identify candidate SHAs.
    
2. **Hydration Phase (Medium Cost):** Calls `WarpGraph.readNode(sha)` only for candidates that passed the Index Phase.
    
3. **Projection Phase (Application Logic):** Parses JSON payloads and returns the final shape.
    

### 3.3 The Operation API

JavaScript

```
const query = graph.query()
  .from('HEAD')                                  // Entry point
  .ancestors({ maxDepth: 20 })                   // TraversalService integration
  .where({ author: 'James Ross' })               // Index-level filter
  .where(n => n.payload.amount > 500)            // Hydrated functional filter
  .select(n => n.payload.orderId)                // Selective projection
  .limit(5);                                     // Early cancellation
```

## 4. Implementation Details

### 4.1 Leveraging `WarpGraph`

WarpQL will wrap `iterateNodes` and `readNode`.

- **Early Exit:** When `.limit(n)` is reached, the engine will trigger the `AbortSignal` already supported by `WarpGraph.iterateNodes` to close the Git log stream immediately.
    
- **Bulk Hydration:** For non-streaming terminal calls (`.toArray()`), the engine can use the sequential optimization logic seen in `createNodes` to fetch messages in batches.
    

### 4.2 Leveraging `TraversalService`

The engine will act as a high-level coordinator for `bfs`, `dfs`, and `ancestors`.

- **Predicate Push-down:** If a `.where()` clause targets a field indexed in a meta-shard (e.g., `author`), the engine will re-order the plan to intersect that bitmap with the traversal frontier.
    

### 4.3 Streaming Support

WarpQL will implement the `AsyncIterator` protocol, allowing native JS streaming:

JavaScript

```
for await (const order of graph.query().where({ type: 'order' })) {
  // Processes nodes one-by-one as they exit the Git stream
}
```

## 5. Performance Goals

- **Memory Usage:** Remain O(1) relative to total graph size by keeping only the `visited` Set and the current BFS queue in memory.
    
- **I/O Minimization:** Ensure `showNode` (Git cat-file) is only called for nodes that meet all upstream criteria.
    

## 6. Strategic Roadmap

### Phase 1: Fluent Wrapper (2 weeks)

- Implement `QueryBuilder.js`.
    
- Standardize the `OperationStack`.
    
- Support basic `from()`, `where(fn)`, and `limit()`.
    

### Phase 2: Index Integration (3 weeks)

- Expose `BitmapIndexReader` to the planner.
    
- Implement "Smart Filters" that detect prefix matches or authorship without loading commit bodies.
    

### Phase 3: Planner & Explain (2 weeks)

- Add `.explain()` to return the execution plan (e.g., "Visited 500, Hydrated 10, Returned 5").
    
- Optimize plan re-ordering (e.g., moving `limit` before `select`).
    

## 7. Risks

- **Implicit Parsing:** Users might expect `.where(n => n.field === 'x')` to be fast. We must document that functional predicates trigger I/O.
    
- **Large `visited` Sets:** In massive graphs, the BFS `visited` set in `TraversalService` can grow. We may need to investigate Bloom filters for Phase 4.
    

---

**Would you like to review the proposed `QueryBuilder` class structure to see how it handles the transition from Phase 1 to Phase 2?**

---

My Gut™ says the **Pipeable Operators (Functional Composition)** approach is the superior move for the current state of `@git-stunts/empty-graph`.

While the LINQ/WarpQL API is the "sexiest" for the README, your codebase is built on lean, specialized services like `WarpGraph` and `TraversalService`. Forcing a monolithic `QueryBuilder` class on top of them right now feels like building a skyscraper on top of a very high-quality tent.

Here is why my gut is leaning toward **Pipes**:

- **Honors the Async Generator:** Your `iterateNodes` and `bfs` already yield nodes one-by-one. Pipeable operators (like `filter`, `limit`, `hydrate`) can be written as simple wrappers that yield values forward, keeping your memory usage at $O(1)$ without any complex "Query Provider" overhead.
    
- **The "Lazy Hydration" Problem:** Loading commit messages via `readNode` is your biggest bottleneck. With a pipe, you can explicitly control exactly when `lazyHydrate()` occurs in the chain. This prevents accidental OOMs or I/O spikes that hidden LINQ magic might trigger.
    
- **Development Speed:** You could have a working "v1" of this in a single afternoon by adding a `utils/operators.js` file. You don't have to design an entire AST parser or a stateful builder class.
    
- **Debuggability:** If a query fails, it’s much easier to trace through a series of discrete functions than a "black box" query planner.
    

### The "Gemini Recommended" V1 Architecture

Instead of one big class, I’d suggest a simple `pipe` utility:

JavaScript

```
// Example of the "Gut Choice" in action
const results = await collect(
  pipe(
    graph.traversal.ancestors({ sha: 'HEAD' }), // Returns AsyncGenerator
    filterByIndex({ type: 'order' }),           // Uses BitmapIndexReader internally
    lazyHydrate(graph),                         // Calls persistence.showNode only for matches
    limit(10)                                   // Triggers AbortSignal to stop Git log
  )
);
```

### Next Step

**Would you like me to write the actual implementation for a `pipe` utility and a few core operators (like `filterByIndex` and `lazyHydrate`)?** We can get this running in your test suite today.