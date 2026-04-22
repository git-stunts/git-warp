---
id: IDEA_error-code-registry
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Error code registry as importable constants

Expose error codes as importable constants so consumers can do
programmatic matching without instanceof:

```ts
import { ErrorCodes } from '@git-stunts/git-warp';

try { ... } catch (e) {
  if (e.code === ErrorCodes.REF_NOT_FOUND) { ... }
}
```

Useful for consumers in different runtimes where instanceof may
break across module boundaries. Complements (not replaces) the
existing custom error class hierarchy.
