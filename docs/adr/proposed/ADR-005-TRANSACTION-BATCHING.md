# ADR 005: Transaction Batching via Git Refs

## Status

Proposed

## Context

Currently, graph writes are immediate and atomic only at the single-commit level. The `createNodes()` method provides a way to bulk-insert data, but it lacks **isolation** and **rollback** capabilities. In a high-concurrency or multi-step workflow, this makes it difficult to ensure that a complex set of related nodes is either fully visible or not visible at all.

## Decision

We will implement a formal **Transaction Manager** that uses Git branches (refs) as isolated "pending transaction" buffers. This allows for optimistic concurrency control and atomic multi-node commits.

### 1. Git Refs as Isolated Buffers

Each transaction will exist as a unique ref under `refs/empty-graph/tx/{uuid}`.

- **Isolation:** Writes within a transaction are only visible to that specific transaction's ref.
    
- **Atomicity:** The final merge (fast-forward) of the transaction ref into the main index ref happens as a single atomic operation.
    

### 2. Optimistic Concurrency Control

We will use Git's native merge semantics to handle conflicts. When a transaction attempts to `commit()`, the system performs the following checks:

1. **No Conflict:** The `baseSha` of the transaction matches the current `targetRef`.
    
2. **Fast-Forward Possible:** The `baseSha` is an ancestor of the `targetRef`, meaning the target moved forward but did not introduce divergent history.
    
3. **Conflict:** History has diverged, and the transaction must be aborted or rebased.
    

## Technical Specification

### The Transaction Manager API

JavaScript

```
export class TransactionManager {
  async beginTransaction(options = { baseRef: 'HEAD' }) {
    const txId = crypto.randomUUID();
    const baseSha = await this.storage.readRef(options.baseRef);
    const txRef = `refs/empty-graph/tx/${txId}`;
    
    await this.storage.updateRef(txRef, baseSha);
    return new Transaction({ id: txId, ref: txRef, baseSha, manager: this });
  }
}
```

### Placeholder Resolution ($N)

To allow nodes within a single transaction to reference each other before they are officially committed, the API supports `$N` placeholders, where $N$ is the index of the node created within that transaction.

JavaScript

```
const tx = await graph.beginTransaction();
const nodeA = await tx.createNode({ message: 'Root' });
// Uses '$0' to reference the result of the first node creation
const nodeB = await tx.createNode({ message: 'Child', parents: ['$0'] }); 
await tx.commit();
```

## Consequences

### Positive

- **Atomicity:** Entire sets of nodes appear in the main graph simultaneously.
    
- **Zero-Cost Rollback:** Aborting a transaction simply requires deleting the transaction ref; the unreferenced blobs will be cleaned up by Git's garbage collection.
    
- **Index Efficiency:** Transactions can trigger a single incremental index update on commit rather than updating for every individual node.
    

### Negative / Neutral

- **Ref Bloat:** Long-running or abandoned transactions can create "orphan" refs. A periodic cleanup job (`gc`) will be required to prune refs older than a defined threshold.
    
- **Concurrency Complexity:** Clients must implement retry logic to handle `TransactionConflictError`.
    

## Validation Strategy

- **Conflict Testing:** Mock two concurrent transactions attempting to modify the same branch to verify the `merge-base` logic correctly identifies the conflict and protects the main index.