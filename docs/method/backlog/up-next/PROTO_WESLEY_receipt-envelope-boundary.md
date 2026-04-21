# WESLEY Receipt Envelope Boundary

Coordination: `WESLEY_protocol_surface_cutover`

The current Continuum hill is trying to prove one boring shared contract
family, likely around receipts and nearby causal-envelope nouns. That only
works if `git-warp` names which receipt and provenance fields are substrate
facts and which are debugger or runtime projections.

Wesley should not guess these nouns from the outside, and `warp-ttd` should not
smuggle debugger policy back into the substrate envelope.

Work:

- freeze the minimal substrate-owned receipt and provenance anchors external
  consumers may depend on
- keep adapter and debugger projections out of the substrate contract
- expose stable names, digests, or version hooks Wesley can target without
  reinterpreting substrate semantics
- coordinate with `PROTO_playback-head-alignment` so external consumers follow
  stable read nouns instead of inventing them early

## Release home

Primary release home: `v19`, with fuller distributed follow-through in `v21`.

The boundary freeze belongs in `v19` because the repo needs one honest receipt
and provenance seam. The richer plural/distributed consequences of that seam
can extend into `v21`.
