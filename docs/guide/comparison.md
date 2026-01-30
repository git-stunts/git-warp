# Database Comparison

EmptyGraph is a specialized storage engine. It is not a general-purpose replacement for relational or document databases. Understanding where it fits in the landscape is key to successful implementation.

## Comparison Table

| Feature | EmptyGraph | PostgreSQL | Neo4j | SQLite |
| :--- | :--- | :--- | :--- | :--- |
| **Persistence** | Git Object DB | Disk (Row/Col) | Graph Native | Single File |
| **Query Lang** | JS Traversal | SQL | Cypher | SQL |
| **Concurrency** | Lock-file (Optimistic) | MVCC / Locking | ACID | File-locking |
| **History** | Built-in (Git) | Manual (Audit logs) | Manual | Manual |
| **Offline Sync** | Native (Git Push/Pull) | Complex (Logical Rep) | Complex | No (Single file) |
| **Indexing** | Roaring Bitmaps | B-Tree / GIN | B-Tree / Hash | B-Tree |
| **Integrity** | Merkle DAG | Constraints / FKs | Schema-less/Optional | Constraints |

## Why EmptyGraph?

### 1. The Distributed Nature
If your data needs to be shared across a fleet of edge devices or developer machines, Git is the world's most battle-tested synchronization engine. EmptyGraph allows you to treat your database as a repository that you can `fork`, `branch`, and `merge`.

### 2. Built-in Audit Trail
In a standard database, the history of "who changed what" is a feature you have to build. In EmptyGraph, it is the primary primitive. Every state change is a cryptographically signed commit.

### 3. Environment Native
EmptyGraph is "Ghost Software." It requires no server, no background process, and no external files. It hides inside the `.git` folder that already exists in your project.

## When NOT to use EmptyGraph

- **High-Frequency Writes:** Every write is a `git commit-tree`. If you need thousands of writes per second, use a dedicated WAL-based database like Postgres.
- **Complex Ad-hoc Queries:** If you need to perform arbitrary joins across millions of nodes without knowing the traversal path ahead of time, a SQL engine or Cypher will outperform raw JS traversal.
- **Large Binary Blobs:** Git is not a File Hosting service. Storing large images or videos in commit messages will lead to massive repository bloat. EmptyGraph is for **Metadata** and **Event Logs**.
