# 0047 Retrospective — Extract Warp-Kernel Package

## Conclusion

Not met. Premise invalid.

Cycle `0047` surfaced the same publish-surface trap that blocked
`warp-orset` extraction in cycle `0020`.

What was learned:

- `@git-stunts/warp-kernel` is still a private workspace shell
- root shipped source cannot import it safely without breaking consumers
- relative imports into `packages/warp-kernel/` would be package cosplay, not a
  real extraction

## What changed in repo truth

- `INFRA_extract-warp-kernel-package` is no longer treated as a truthful
  near-term move
- the real successor is
  `INFRA_extract-warp-kernel-package-post-publish`
- `INFRA_extract-warp-adapters-package` now depends on the publish-safe kernel
  extraction path instead of pretending it can happen independently

## Next

The next extraction slice is not another fake move. It is the same prerequisite
we already knew from `warp-orset`: get the multi-package publish surface honest,
then extract against that reality.
