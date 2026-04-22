---
id: PROTO_ttd-observer-aperture-envelopes
blocked_by: []
blocks: []
---

# First-class observer and aperture envelopes in warp-ttd protocol

The stack now treats observers as the primary read surface and apertures as the
thing that shapes projection. But the current `warp-ttd` protocol surface is
still mostly lane/frame/receipt oriented. It has `observerId` and `apertureId`
fields in context, but no first-class envelope family for observer or aperture
definition itself.

That means the debugger can inspect playback and receipts, but it cannot yet
speak the full observer-first language directly:

- what observer surfaces exist?
- what aperture is active?
- how do two apertures differ?
- what basis/accumulation/emission mode is this observer using?

Work:

- introduce host-neutral `ObserverRef` / `ApertureRef` style protocol nouns
- define stable envelope shapes for active observer and aperture descriptions
- decide which parts are substrate truth, which are debugger policy, and which
  are adapter-local convenience
- leave room for OG-I growth toward full structural observers instead of
  freezing a state-only read-view API too early

Why this matters:

- `warp-ttd` is supposed to be the proving ground for the shared observer
  ontology
- agent-first workflows need inspectable observer surfaces, not just playback
  frames
- later counterfactual, compare, and braid features will want explicit aperture
  and observer handles rather than ad hoc option bags

## Source

- observer-first repo doctrine pass, 2026-04-09
- `warp-ttd/schemas/warp-ttd-protocol.graphql` review
