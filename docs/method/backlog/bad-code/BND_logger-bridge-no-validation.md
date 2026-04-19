# LoggerObservabilityBridge has no constructor validation

**Effort:** XS

## Problem

The constructor does not validate its `logger` parameter. Passing
`null` or `undefined` causes a confusing `TypeError` deep inside method
calls instead of a clear error at construction time.

## Suggested Fix

Add a null/undefined check in the constructor. Throw a descriptive error
immediately if the logger is missing.
