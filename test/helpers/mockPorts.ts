/**
 * Shared mock port factories for test fixtures.
 *
 * Eliminates 28+ inline mock implementations scattered across controller
 * and service tests. Each factory returns a vi.fn()-backed mock with
 * sensible defaults that can be overridden per-test.
 */
import { vi, type Mock } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Persistence (GraphPersistencePort surface)
// ---------------------------------------------------------------------------

export interface MockPersistence {
  readRef: Mock;
  updateRef: Mock;
  deleteRef: Mock;
  listRefs: Mock;
  compareAndSwapRef: Mock;
  readBlob: Mock;
  writeBlob: Mock;
  readTree: Mock;
  readTreeOids: Mock;
  writeTree: Mock;
  commitNode: Mock;
  commitNodeWithTree: Mock;
  showNode: Mock;
  getNodeInfo: Mock;
  getCommitTree: Mock;
  logNodes: Mock;
  logNodesStream: Mock;
  countNodes: Mock;
  nodeExists: Mock;
  isAncestor: Mock;
  ping: Mock;
  configGet: Mock;
  configSet: Mock;
  emptyTree: string;
}

const MOCK_OID = 'a'.repeat(40);

export function createMockPersistence(overrides: Partial<MockPersistence> = {}): MockPersistence {
  return {
    readRef: vi.fn().mockResolvedValue(null),
    updateRef: vi.fn().mockResolvedValue(undefined),
    deleteRef: vi.fn().mockResolvedValue(undefined),
    listRefs: vi.fn().mockResolvedValue([]),
    compareAndSwapRef: vi.fn().mockResolvedValue(undefined),
    readBlob: vi.fn().mockResolvedValue(new Uint8Array(0)),
    writeBlob: vi.fn().mockResolvedValue(MOCK_OID),
    readTree: vi.fn().mockResolvedValue({}),
    readTreeOids: vi.fn().mockResolvedValue({}),
    writeTree: vi.fn().mockResolvedValue(MOCK_OID),
    commitNode: vi.fn().mockResolvedValue(MOCK_OID),
    commitNodeWithTree: vi.fn().mockResolvedValue(MOCK_OID),
    showNode: vi.fn().mockResolvedValue(''),
    getNodeInfo: vi.fn().mockResolvedValue({ sha: MOCK_OID, message: '', author: '', date: '', parents: [] }),
    getCommitTree: vi.fn().mockResolvedValue(MOCK_OID),
    logNodes: vi.fn().mockResolvedValue(''),
    logNodesStream: vi.fn().mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} }),
    countNodes: vi.fn().mockResolvedValue(0),
    nodeExists: vi.fn().mockResolvedValue(true),
    isAncestor: vi.fn().mockResolvedValue(false),
    ping: vi.fn().mockResolvedValue({ ok: true, latencyMs: 0 }),
    configGet: vi.fn().mockResolvedValue(null),
    configSet: vi.fn().mockResolvedValue(undefined),
    emptyTree: '4b825dc642cb6eb9a060e54bf8d69288fbee4904',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Codec (CodecPort surface)
// ---------------------------------------------------------------------------

export interface MockCodec {
  encode: Mock;
  decode: Mock;
}

export function createMockCodec(overrides: Partial<MockCodec> = {}): MockCodec {
  return {
    encode: vi.fn((value: unknown) => new Uint8Array(JSON.stringify(value).split('').map(c => c.charCodeAt(0)))),
    decode: vi.fn((bytes: Uint8Array) => JSON.parse(String.fromCharCode(...bytes))),
    ...overrides,
  };
}

/** Stub codec that passes through without real serialization. */
export function createStubCodec(): MockCodec {
  return {
    encode: vi.fn(() => new Uint8Array([1])),
    decode: vi.fn(() => ({})),
  };
}

// ---------------------------------------------------------------------------
// Mock Crypto (CryptoPort surface)
// ---------------------------------------------------------------------------

export interface MockCrypto {
  hash: Mock;
  hmac: Mock;
  sign: Mock;
  verify: Mock;
  randomBytes: Mock;
  timingSafeEqual: Mock;
}

const MOCK_HASH = 'abcdef'.repeat(10) + 'abcd';

export function createMockCrypto(overrides: Partial<MockCrypto> = {}): MockCrypto {
  return {
    hash: vi.fn().mockResolvedValue(MOCK_HASH),
    hmac: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
    sign: vi.fn().mockResolvedValue(new Uint8Array([4, 5, 6])),
    verify: vi.fn().mockResolvedValue(true),
    randomBytes: vi.fn((n: number) => new Uint8Array(n)),
    timingSafeEqual: vi.fn(() => true),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mock Clock (ClockPort surface)
// ---------------------------------------------------------------------------

export interface MockClock {
  now: Mock;
}

/** Creates a clock mock. Optionally auto-increments on each call. */
export function createMockClock(startMs = 0, { autoIncrement = false, step = 1 } = {}): MockClock {
  if (autoIncrement) {
    let tick = startMs;
    return { now: vi.fn(() => tick += step) };
  }
  return { now: vi.fn().mockReturnValue(startMs) };
}

// ---------------------------------------------------------------------------
// Mock Logger (LoggerPort surface)
// ---------------------------------------------------------------------------

export interface MockLogger {
  debug: Mock;
  info: Mock;
  warn: Mock;
  error: Mock;
  child: Mock;
}

export function createMockLogger(): MockLogger {
  const logger: MockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
  logger.child.mockReturnValue(logger);
  return logger;
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export { MOCK_OID, MOCK_HASH };
