---
id: SPEC_error-code-naming-inconsistency
blocked_by: []
blocks: []
feature: tooling-release
---

# Error code naming inconsistency across throw sites

**Effort:** M
**Audit ref:** CQ01-1.3

Error codes are string constants scattered across throw sites with
inconsistent naming conventions:

- `E_PATCH_NO_STATE` (snake_case, short)
- `E_AUTO_MATERIALIZE_TYPE` (snake_case, medium)
- `E_ON_DELETE_WITH_DATA_INVALID` (snake_case, long/awkward)
- `E_CHECKPOINT_POLICY_TYPE` (mixed specificity)
- `E_INVALID_ARG` (very generic)

There is no central registry. Consumers cannot programmatically match
on error codes without hard-coding strings.

## Suggested Fix

Create `src/domain/errors/ErrorCodes.ts` exporting named string constants
for all error codes. Enforce consistent naming: `E_<DOMAIN>_<NOUN>_<VERB>`.
Reference these constants at throw sites.
