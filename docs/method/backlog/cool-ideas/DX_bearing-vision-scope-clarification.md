---
id: DX_bearing-vision-scope-clarification
blocked_by: []
blocks: []
---

# Clarify scope boundaries between BEARING.md and VISION.md

**Audit ref:** DQ01-L-04

Both BEARING.md and VISION.md describe the system's purpose and current
state. VISION.md has been expanded to include public API surface examples,
which overlaps with BEARING.md's "where are we" section. The boundary
between aspirational direction (VISION) and current position (BEARING)
is blurring.

## Proposal

Add a one-line scope header to each file:
- BEARING: "Where we are now — current capabilities, known limits."
- VISION: "Where we're going — architectural north star, future surface."
