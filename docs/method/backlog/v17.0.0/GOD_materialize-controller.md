# Slay MaterializeController (1009 LOC)

Split strategy from design doc: full vs ceiling materialization,
index management.

Natural seams:
- Full materialization pipeline
- Coordinate/ceiling materialization
- Seek cache + index restore
- Detached read graph management
- Auto-checkpoint logic
