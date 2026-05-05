---
id: COOL_no-gods-ci-report
blocked_by: []
blocks: []
feature: testing-quality
---

# NO GODS CI Report

## Idea

Add a CI report, not a hard fail at first, that flags:

- files over LOC ceiling
- classes over method or field count thresholds
- modules with more than one exported runtime object
- constructor parameter bags over threshold
- files importing too many subsystems

## Why It Is Cool

SOLID, DI, one-runtime-object-per-file, and NO GODS become measurable.

## Guardrails

- Report first, ratchet later.
- Private local helper classes are not automatically violations.
- Avoid mechanical file confetti.
- Use evidence and severity, not a single moral panic number.
- Do not replace architecture review with metrics.
