# Promote EventId from @typedef to class

**Effort:** XS

## Problem

`src/domain/utils/EventId.js` defines `EventId` as a `@typedef {Object}`
but has a factory (`createEventId`) and comparison logic. Should be a class.
