/**
 * Storage adapters for public git-warp applications.
 *
 * These aliases intentionally avoid exposing graph-shaped adapter names in the
 * first-use API. The legacy graph-named adapters remain available from
 * `@git-stunts/git-warp/legacy`.
 */

export { default as GitStorageAdapter } from './src/infrastructure/adapters/GitGraphAdapter.ts';
export { default as MemoryStorageAdapter } from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';
export { default as NodeCryptoAdapter } from './src/infrastructure/adapters/NodeCryptoAdapter.ts';
export { default as WebCryptoAdapter } from './src/infrastructure/adapters/WebCryptoAdapter.ts';
export { default as CasContentEncryptionPolicy } from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export type {
  CasContentEncryptionDiagnostics,
  CasContentEncryptionScheme,
  CasResolvedVaultKeyOptions,
} from './src/infrastructure/adapters/CasContentEncryptionPolicy.ts';
export type {
  CollectableStream,
  GitError,
  GitPlumbing,
} from './src/infrastructure/adapters/GitGraphAdapter.ts';
