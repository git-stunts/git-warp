---
id: PERF_encrypted-stores-fixed-chunking
blocked_by: []
blocks: []
feature: runtime-boundaries
---

# Switch encrypted stores to fixed chunking

Both `CasSeekCacheAdapter` and `CasBlobAdapter` use
`{ strategy: 'cdc' }` unconditionally. Ciphertext is pseudorandom
so CDC boundaries provide no dedup benefit. The adapter could check
`_encryptionKey` at init and pick `fixed` vs `cdc` accordingly —
suppressing the git-cas runtime warning and saving rolling hash
overhead.
