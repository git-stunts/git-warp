# Extract state/ from domain/services/

Move the 6 state/checkpoint files into `src/domain/services/state/`.

## Files

- CheckpointSerializerV5.js (289)
- CheckpointService.js (588)
- StateReaderV5.js (599)
- StateSerializerV5.js (176)
- StateDiff.js (373)
- WarpStateV5.js (86)

## Why

All about persisting and recovering materialized state.
CheckpointService is the main entry point. Clear single
responsibility: state lifecycle.

## Scope

Move files, update imports across services/, controllers/, and
domain/. No behavioral changes.

## Source

Cycle 0004 analysis.
