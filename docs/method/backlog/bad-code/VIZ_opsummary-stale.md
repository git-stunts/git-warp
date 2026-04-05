# opSummary.js missing M13 canonical op types

**Effort:** S

## What's wrong

The `OP_DISPLAY` map in `opSummary.js` does not include `NodePropSet` and `EdgePropSet` (added in M13 canonicalization). Tick receipts using canonical op types render with `'?'` symbols and empty labels. Unknown ops are silently dropped without warning.

## Suggested fix

- Add `NodePropSet` and `EdgePropSet` entries to `OP_DISPLAY`.
- Throw or log a warning on unknown op types instead of silently dropping them. Silent failures hide bugs.
