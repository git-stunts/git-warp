---
id: PROTO_witness-type
blocked_by: []
blocks: []
---

# First-class Witness type

The WARP Optics working note distinguishes Witness from TickReceipt:

- **Witness**: minimal information for local reversibility
- **TickReceipt**: larger operational envelope (`TickReceipt ⊇ Witness`)

The codebase has TickReceipt but no Witness. Extracting the witness
sub-concept would enable:

- Smaller provenance payloads (carry witness, not full receipt)
- Formal reversibility proofs (`invert(apply(S), W) = S`)
- Cleaner optic shape (`ω` in the WARP optic `Ω = (π, φ, ρ, ω, σ)`)

## Source

WARP Optics working note §7, cycle 0006 noun audit.
