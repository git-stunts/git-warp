# Conflict Pipeline God-Context

All three conflict pipeline modules (`ConflictFrameLoader`,
`ConflictCandidateCollector`, `ConflictTraceAssembler`) receive the
`ConflictAnalyzerService` instance as their first argument and reach
into it for `service._hash()` and `service._graph`.

This makes the service a god-context bag rather than an orchestrator.
The pipeline modules are coupled to the service's internal shape instead
of depending on explicit, narrow interfaces.

## Fix

Extract a `ConflictPipelineContext` object (or just a plain options bag)
that carries the two things the pipeline actually needs:

- A hash function: `(payload: unknown) => Promise<string>`
- A graph reference (for frontier, writer patches, etc.)

Pass this context from `analyze()` instead of `this`. The pipeline
modules stop knowing about `ConflictAnalyzerService` entirely.

## Files

- `src/domain/services/strand/ConflictAnalyzerService.js`
- `src/domain/services/strand/ConflictFrameLoader.js`
- `src/domain/services/strand/ConflictCandidateCollector.js`
- `src/domain/services/strand/ConflictTraceAssembler.js`
