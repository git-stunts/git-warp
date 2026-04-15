# 0018: Shadow-Trie ORSet + Workspace Package Reorganization

This document is the governing handoff package. See the full text in
the conversation record. The canonical version lives here.

## Summary

Replace memory-resident ORSet with a bounded-residency storage-backed
ORSet engine using a hashed prefix trie stored as native Git objects.
Reorganize the repository into a workspace with four packages:
git-warp (product), warp-kernel (engine), warp-adapters (infrastructure),
warp-orset (ORSet engine).

## Status

Design approved. Backlog decomposition is the next step.
