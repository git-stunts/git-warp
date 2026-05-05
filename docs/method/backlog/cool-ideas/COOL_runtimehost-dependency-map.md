---
id: COOL_runtimehost-dependency-map
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# RuntimeHost Dependency Map

## Idea

Generate a dependency map of `RuntimeHost` responsibilities:

- constructed controllers
- injected dependencies
- mutable state fields
- public capabilities
- internal underscore seams
- downstream consumers

## Why It Is Cool

Before cutting the god object, X-ray it. Do not operate blind.

## Guardrails

- This is reconnaissance, not refactor permission.
- Do not rewrite `RuntimeHost` while generating the map.
- Group evidence by responsibility and seam, not by blame.
- The output should help choose one narrow extraction cycle at a time.
