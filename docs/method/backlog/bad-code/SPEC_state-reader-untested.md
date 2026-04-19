# StateReaderV5.js (599 LOC) has zero tests

**Effort:** S

## Issue

StateReaderV5 reads materialized state projections (visible nodes,
edges, properties). Zero dedicated tests. Used by multiple controllers
and services.

## Fix

Create unit tests. Pure function module — mock the state, verify
projections.
