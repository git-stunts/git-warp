export { createOidGenerator, createHashGenerator, generateOidFromNumber } from './WarpGraphObjectIds.ts';
export { createMockPersistence, createPopulatedMockPersistence } from './WarpGraphMockPersistence.ts';
export {
  createInlineValue,
  createMockPatch,
  createMockPatchWithIO,
  createNodeAddV2,
  createNodeRemoveV2,
  createNodeTombstoneV2,
  createEdgeAddV2,
  createEdgeTombstoneV2,
  createPropSetV2,
  createPatch,
  createSamplePatches,
} from './WarpGraphPatchFixtures.ts';
export { createMockLogger } from './WarpGraphMockLogger.ts';
export { createGitRepo, createInMemoryRepo } from './WarpGraphTestRepositories.ts';
export { addNodeToState, addEdgeToState, setupGraphState } from './WarpGraphStateSeed.ts';
export { Dot } from '../../src/domain/crdt/Dot.ts';
export { default as VersionVector } from '../../src/domain/crdt/VersionVector.ts';
export { createEmptyState, encodeEdgeKey } from '../../src/domain/services/JoinReducer.ts';
