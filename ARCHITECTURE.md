# Architecture: @git-stunts/empty-graph

A graph database substrate using Git commits pointing to the empty tree.

## 🧱 Core Concepts

### Domain Layer (`src/domain/`)
- **Entities**: `GraphNode` represents a commit in the graph with its metadata and data (message).
- **Services**: `GraphService` manages node creation, retrieval, and history listing.

### Ports Layer (`src/ports/`)
- **GraphPersistencePort**: Defines the interface for commit-tree and log operations.

### Infrastructure Layer (`src/infrastructure/`)
- **GitGraphAdapter**: Implementation using `@git-stunts/plumbing`.

## 📂 Directory Structure

```
src/
├── domain/
│   ├── entities/       # GraphNode
│   └── services/       # GraphService
├── infrastructure/
│   └── adapters/       # GitGraphAdapter
└── ports/              # GraphPersistencePort
```
