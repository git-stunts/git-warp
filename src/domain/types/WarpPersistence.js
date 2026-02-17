/**
 * Role-specific persistence port types.
 *
 * Instead of casting to `any` when accessing persistence methods,
 * use these narrow types to document which port methods are actually needed.
 *
 * @module domain/types/WarpPersistence
 */

/**
 * Full persistence port — commit + blob + tree + ref + config.
 * @typedef {import('../../ports/GraphPersistencePort.js').default} WarpPersistence
 */

/**
 * Read-side persistence — commit reads, blob reads, tree reads, ref reads.
 * @typedef {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} PersistenceReader
 */

/**
 * Write-side persistence — commit creation, blob writes, tree writes, ref updates.
 * @typedef {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} PersistenceWriter
 */

/**
 * Ref-only persistence — ref reads, writes, CAS, listing.
 * @typedef {import('../../ports/RefPort.js').default} RefPersistence
 */

/**
 * Checkpoint persistence — commit + blob + tree + ref (no config).
 * @typedef {import('../../ports/CommitPort.js').default & import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} CheckpointPersistence
 */

/**
 * Index storage — blob reads/writes, tree reads/writes, ref reads/writes.
 * Matches the dynamically-composed IndexStoragePort interface.
 * @typedef {import('../../ports/BlobPort.js').default & import('../../ports/TreePort.js').default & import('../../ports/RefPort.js').default} IndexStorage
 */

// Export nothing at runtime — types only
export {};
