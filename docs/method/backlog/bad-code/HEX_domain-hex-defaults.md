---
id: HEX_domain-hex-defaults
blocked_by: []
blocks: []
---

# defaultCodec/defaultCrypto/defaultTrustCrypto import infrastructure in domain

**Effort:** M

## What's Wrong

Three files in `src/domain/utils/` directly import infrastructure
dependencies:

- `defaultCodec.js` imports `cbor-x`
- `defaultCrypto.js` imports `node:crypto`
- `defaultTrustCrypto.js` imports `node:crypto`

These are the root cause of systemic P5 / hexagonal violations across
15+ domain files that use them as convenience defaults.

## Suggested Fix

Delete these files as the P5 codec dissolution
(`NDNM_defaultcodec-to-infrastructure`) completes. Each is a hex
violation that should not exist. Callers should receive codecs and
crypto adapters via dependency injection.
