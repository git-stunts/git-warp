# Bad-Code Legend Doc Renames Batch 02

The invariant legend map is now the source of truth, but these
filenames still encode retired umbrella identities.

Keep the rename work bounded: fix 10 paths, update references, and
move on.

## Fix

Rename each file below, preserve body content, update
`docs/method/backlog/bad-code/README.md`, and repair any in-repo
references to the old path.

## Files

- `docs/method/backlog/bad-code/CC_writerid-ambient-entropy.md` -> `docs/method/backlog/bad-code/HEX_writerid-ambient-entropy.md`
- `docs/method/backlog/bad-code/PROTO_cli-hook-installer-raw-git-bypass.md` -> `docs/method/backlog/bad-code/HEX_cli-hook-installer-raw-git-bypass.md`
- `docs/method/backlog/bad-code/PROTO_runtimehelpers-plumbing-composition-leak.md` -> `docs/method/backlog/bad-code/HEX_runtimehelpers-plumbing-composition-leak.md`
- `docs/method/backlog/bad-code/PROTO_scripts-raw-git-subprocess-policy-gap.md` -> `docs/method/backlog/bad-code/HEX_scripts-raw-git-subprocess-policy-gap.md`
- `docs/method/backlog/bad-code/PROTO_warpruntime-open-plumbing-composition-leak.md` -> `docs/method/backlog/bad-code/HEX_warpruntime-open-plumbing-composition-leak.md`
- `docs/method/backlog/bad-code/PROTO_warpserve-domain-infra-blur.md` -> `docs/method/backlog/bad-code/HEX_warpserve-domain-infra-blur.md`
- `docs/method/backlog/bad-code/TRUST_domain-crypto-hex.md` -> `docs/method/backlog/bad-code/HEX_domain-crypto-hex.md`
- `docs/method/backlog/bad-code/CC_cbor-no-depth-limits.md` -> `docs/method/backlog/bad-code/BND_cbor-no-depth-limits.md`
- `docs/method/backlog/bad-code/CC_checkpoint-deserialize-null-silent.md` -> `docs/method/backlog/bad-code/BND_checkpoint-deserialize-null-silent.md`
- `docs/method/backlog/bad-code/CC_logger-bridge-no-validation.md` -> `docs/method/backlog/bad-code/BND_logger-bridge-no-validation.md`
