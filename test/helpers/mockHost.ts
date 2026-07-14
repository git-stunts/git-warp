/**
 * Shared mock WarpRuntime host factory for controller tests.
 *
 * Eliminates 11+ duplicate createMockHost() implementations across
 * controller test files. Provides a complete host shape with sensible
 * defaults — every field can be overridden per-test.
 */
import { vi, type Mock } from 'vitest';
import VersionVector from '../../src/domain/crdt/VersionVector.ts';
import {
  createMockPersistence,
  createMockCrypto,
  createMockCodec,
  type MockPersistence,
  type MockCrypto,
  type MockCodec,
} from './mockPorts.ts';

// ---------------------------------------------------------------------------
// Mock Host — the shape that all controllers depend on
// ---------------------------------------------------------------------------

export interface MockHost {
  // Identity
  _writerId: string;
  _graphName: string;

  // Ports
  _persistence: MockPersistence;
  _codec: MockCodec;
  _crypto: MockCrypto;
  _logger: null | { debug: Mock; info: Mock; warn: Mock; error: Mock; child: Mock };

  // State
  _cachedState: unknown;
  _stateDirty: boolean;
  _lastFrontier: Map<string, string> | null;
  _materializedGraph: unknown;
  _versionVector: VersionVector;
  _maxObservedLamport: number;
  _provenanceIndex: unknown;
  _provenanceDegraded: boolean;

  // Patch state
  _patchInProgress: boolean;
  _patchesSinceCheckpoint: number;
  _patchesSinceGC: number;
  _onDeleteWithData: 'reject' | 'cascade' | 'warn';

  // Optional ports
  _patchJournal: unknown;
  _patchBlobStorage: unknown;
  _blobStorage: unknown;
  _checkpointStore: unknown;
  _auditService: unknown;
  _auditSkipCount: number;
  _effectPipeline: unknown;

  // Index state
  _logicalIndex: unknown;
  _propertyReader: unknown;
  _cachedViewHash: string | null;
  _cachedIndexTree: unknown;
  _indexDegraded: boolean;
  _viewService: unknown;
  _stateHashService: unknown;

  // Ceiling/seek state
  _seekCeiling: number | null;
  _cachedCeiling: number | null;
  _cachedFrontier: Map<string, string> | null;

  // Checkpoint
  _checkpointPolicy: { every: number } | null;
  _checkpointing: boolean;
  _autoMaterialize: boolean;

  // Subscribers
  _subscribers: unknown[];
  _lastNotifiedState: unknown;

  // Methods (vi.fn mocks)
  materialize: Mock;
  _setMaterializedState: Mock;
  discoverWriters: Mock;

  // Dynamic — allows controller-specific extras
  [key: string]: unknown;
}

export interface MockHostOptions {
  writerId?: string;
  graphName?: string;
  persistence?: Partial<MockPersistence>;
  codec?: MockCodec;
  crypto?: MockCrypto;
  overrides?: Record<string, unknown>;
}

export function createMockHost(options: MockHostOptions = {}): MockHost {
  const {
    writerId = 'alice',
    graphName = 'test-graph',
    persistence: persistenceOverrides,
    codec,
    crypto,
    overrides = {},
  } = options;

  const mockPersistence = createMockPersistence(persistenceOverrides);

  const host: MockHost = {
    // Identity
    _writerId: writerId,
    _graphName: graphName,

    // Ports
    _persistence: mockPersistence,
    _codec: codec ?? createMockCodec(),
    _crypto: crypto ?? createMockCrypto(),
    _logger: null,

    // State
    _cachedState: null,
    _stateDirty: false,
    _lastFrontier: null,
    _materializedGraph: null,
    _versionVector: VersionVector.empty(),
    _maxObservedLamport: 0,
    _provenanceIndex: null,
    _provenanceDegraded: false,

    // Patch state
    _patchInProgress: false,
    _patchesSinceCheckpoint: 0,
    _patchesSinceGC: 0,
    _onDeleteWithData: 'reject',

    // Optional ports
    _patchJournal: null,
    _patchBlobStorage: null,
    _blobStorage: null,
    _checkpointStore: null,
    _auditService: null,
    _auditSkipCount: 0,
    _effectPipeline: null,

    // Index state
    _logicalIndex: null,
    _propertyReader: null,
    _cachedViewHash: null,
    _cachedIndexTree: null,
    _indexDegraded: false,
    _viewService: null,
    _stateHashService: null,

    // Ceiling/seek state
    _seekCeiling: null,
    _cachedCeiling: null,
    _cachedFrontier: null,

    // Checkpoint
    _checkpointPolicy: null,
    _checkpointing: false,
    _autoMaterialize: false,

    // Subscribers
    _subscribers: [],
    _lastNotifiedState: null,

    // Methods
    materialize: vi.fn(),
    _setMaterializedState: vi.fn(async (state: unknown) => { host._cachedState = state; }),
    discoverWriters: vi.fn().mockResolvedValue([]),

    // Overrides
    ...overrides,
  };

  return host;
}
