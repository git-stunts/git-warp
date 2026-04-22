---
id: BND_http-request-typedef
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# HttpRequest/HttpResponse are typedef-only port boundary types

**Effort:** S

## Problem

`HttpServerPort.js` defines `HttpRequest`, `HttpResponse`, and
`HttpServerHandle` as `@typedef` with no runtime validation. A request
handler receiving `method: 42` would fail deep inside the handler with a
confusing TypeError instead of a clear error at the HTTP boundary.

## Suggested Fix

Promote to classes with constructor validation at the HTTP boundary.
Invalid requests should fail fast with descriptive errors before reaching
any handler logic.
