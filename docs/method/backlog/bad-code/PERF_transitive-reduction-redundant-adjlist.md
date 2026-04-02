# transitiveReduction builds adjacency list redundantly

**Effort:** S

## Problem

After getting `_neighborEdgeMap` from topo sort (which already has
full neighbor data), `transitiveReduction()` builds a *second*
`adjList: Map<string, string[]>` by extracting just the neighborIds.
Two representations of the same edge set sit in memory
simultaneously.

## Fix

Use `_neighborEdgeMap` directly in the BFS, accessing `.neighborId`
inline instead of pre-extracting.
