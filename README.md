# @git-stunts/empty-graph

A graph database where every node is a Git commit pointing to the "Empty Tree."

## Why EmptyGraph?

Git is usually used to track files. `EmptyGraph` subverts this by using Git's Directed Acyclic Graph (DAG) to store structured data *in the commits themselves*. 

Because all commits point to the "Empty Tree," your data does not exist as files in the working directory—it exists entirely within the Git object database.

## Features

- **Invisible Storage**: No files are created in the working directory.
- **Atomic Operations**: Leverages Git's reference updates.
- **DAG Native**: Inherits Git's parent-child relationship model.

## Usage

```javascript
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph from '@git-stunts/empty-graph';

const git = new GitPlumbing({ cwd: './my-db' });
const graph = new EmptyGraph({ plumbing: git });

// Create a node (commit)
const parentSha = graph.createNode({ message: 'First Entry' });

// Create a child node
const childSha = graph.createNode({ 
  message: 'Second Entry', 
  parents: [parentSha] 
});

// Read data
const data = graph.readNode({ sha: childSha });

// List linear history
const nodes = graph.listNodes({ ref: childSha });
```
