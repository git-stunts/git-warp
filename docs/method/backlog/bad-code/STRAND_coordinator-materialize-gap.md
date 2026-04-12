---
id: STRAND_coordinator-materialize-gap
---

# StrandCoordinator.materialize() skips detached base graph

## Problem

`StrandService.materialize()` creates a detached read graph via
`openDetachedReadGraph()` before materializing. This is load-bearing:
strands are copy-on-write forks from a specific tick. The detached
graph provides the base state that the strand reads through, and the
materializer layers overlay patches on top.

`StrandCoordinator.materialize()` skips this — it calls
`materializer.materializeDescriptor()` directly without creating the
base view. This may produce incorrect materialization because the
strand won't see base graph state through the fork point.

## Fix

Inject a `createBaseView` dep into StrandCoordinator that handles
the detached graph creation. The coordinator calls it before
delegating to the materializer.

## Context

Discovered during attempted StrandService dissolution. StrandService
(992 LOC) is marked blocked-by `API_capability-interfaces` in the
backlog. The dissolution is deferred until this gap is resolved.
