# OG-005 — Benchmark Detached Coordinate And Working-Set Reads

Status: QUEUED

## Problem

Detached read handles are safer, but their cost is not yet measured.

## Why This Matters

Before adding new caching layers or optimizing around detached reads, we should
know what the coordinate and working-set read boundary actually costs.

## Promotion Trigger

Promote this item when the next performance or caching slice begins.
