# CasBlobAdapter and CasSeekCacheAdapter duplicate _initCas()

**Effort:** S

## What's Wrong

Both `CasBlobAdapter` and `CasSeekCacheAdapter` contain near-identical `_initCas()` methods: dynamic import of `@git-stunts/git-cas`, `CborCodec` construction, optional `LoggerObservabilityBridge`, and `ContentAddressableStore` construction. The shared `lazyCasInit.js` handles caching but not the initialization logic itself.

This is a DRY violation — two files that must change in lockstep whenever CAS construction evolves.

## Suggested Fix

Extract the shared initialization sequence into `lazyCasInit.js` or a new `CasFactory` module. Both adapters call the factory instead of owning the recipe.
