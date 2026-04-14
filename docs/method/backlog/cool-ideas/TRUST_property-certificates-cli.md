---
id: TRUST_property-certificates-cli
---

# `git warp certify` — property certificates as CLI output

Paper VII §5.1 describes property certificates: provable evidence
that a strand satisfies type safety, admission integrity, provenance
linkage, and policy conformance at a required tier.

`git warp certify <strand-id>` could emit a certificate:

```
Certificate for strand speculative/feature-x:
  ✓ Type safety: all ops well-formed
  ✓ Admission integrity: all ticks have receipts
  ✓ Provenance linkage: chain back to base worldline verified
  ✓ Policy conformance: CRDT coexistence satisfied
  Basis: worldline/main @ tick 42
  Tier: full (forensic trace available)
  Expires: 2026-04-30T00:00:00Z
```

This is how speculative work proves its lawfulness without
exposing its interior autobiography.
