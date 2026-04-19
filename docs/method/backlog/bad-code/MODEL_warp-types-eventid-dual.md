# EventId defined as both typedef and class

**Effort:** S

## Problem

`WarpTypes.js` defines `EventId` as a `@typedef` with a
`createEventId()` factory returning plain objects.
`src/domain/utils/EventId.js` defines `EventId` as a proper class with
constructor validation. Two sources of truth for the same concept
violates P6 (single authoritative representation).

## Suggested Fix

Delete the typedef version in `WarpTypes.js` and the `createEventId()`
factory. Use the `EventId` class everywhere.
