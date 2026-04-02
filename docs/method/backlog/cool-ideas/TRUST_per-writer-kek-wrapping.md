# Per-writer key envelope encryption (KEK wrapping)

Each writer gets their own DEK wrapped by a shared KEK. git-cas
already supports envelope encryption — the DEK/KEK split could be
wired at the `CasBlobAdapter` level, with writer ID selecting which
wrapped DEK to use. Lets you revoke a single writer's access by
re-wrapping without re-encrypting all data. Pairs with
`@git-stunts/vault` for KEK storage.
