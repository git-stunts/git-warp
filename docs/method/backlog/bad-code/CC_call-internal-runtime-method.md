# callInternalRuntimeMethod walks prototype chains

**Effort:** M

## Problem

This utility skips facade shims by walking grandparent prototypes to
call "real" methods. It signals a deeper problem: the class hierarchy
requires callers to bypass normal dispatch. This is brittle coupling to
the inheritance structure -- any refactor of the class hierarchy breaks
callers silently.

## Suggested Fix

Fix the facade so it doesn't shadow methods that need to be called
directly. Eliminate the need for prototype walking entirely. If the
facade must intercept, use explicit delegation rather than inheritance
shadowing.
