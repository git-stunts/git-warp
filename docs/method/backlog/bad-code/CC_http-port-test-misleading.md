# HttpServerPort test says "request/response cycle" but only tests interface shape

**Effort:** XS

## Issue

Test description says "handles a basic request/response cycle" but
body only checks `server.listen` and `server.close` are defined.
Never makes a request.

## Fix

Either rename the test to match what it does, or add an actual
request/response test.
