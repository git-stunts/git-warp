# Convert remaining 93 .js files to TypeScript

Phase 2 of cycle 0013. Every .js in src/domain/ becomes .ts.
Kill all @type casts, @typedef blocks, @param/@returns JSDoc.

Subdirectory order per design doc:
1. `strand/` (14 files)
2. `controllers/` (8 files remaining — 2 already TS)
3. `state/` (7 files)
4. `index/` (13 files)
5. `query/` (3 files remaining)
6. `dag/` (4 files)
7. remaining flat services
8. `trust/` (7 files)
