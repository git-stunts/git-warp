/**
 * Test helpers barrel export.
 *
 * Usage:
 *   import { createMockHost, createMockPersistence, patch, nodeAdd } from '../../test/helpers/index.ts';
 */

// Mock ports (persistence, codec, crypto, clock, logger)
export {
  createMockPersistence,
  createMockCodec,
  createStubCodec,
  createMockCrypto,
  createMockClock,
  createMockLogger,
  MOCK_OID,
  MOCK_HASH,
  type MockPersistence,
  type MockCodec,
  type MockCrypto,
  type MockClock,
  type MockLogger,
} from './mockPorts.ts';

// Mock WarpRuntime host (for controller tests)
export {
  createMockHost,
  type MockHost,
  type MockHostOptions,
} from './mockHost.ts';

// Patch and op factories
export {
  dot,
  nodeAdd,
  nodeRemove,
  edgeAdd,
  edgeRemove,
  propSet,
  nodePropSet,
  edgePropSet,
  inlineValue,
  blobValue,
  patch,
  patchChain,
  graphOps,
  type TestDot,
  type TestPatchOptions,
} from './patchFactories.ts';

// Error factories (replaces raw `new Error()`)
export {
  gitError,
  refNotFoundError,
  missingObjectError,
  syncNetworkError,
  syncTimeoutError,
  domainError,
} from './errorFactories.ts';
