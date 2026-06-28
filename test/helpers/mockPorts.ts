/**
 * Shared mock port factories for test fixtures.
 *
 * Eliminates 28+ inline mock implementations scattered across controller
 * and service tests. Each factory returns a vi.fn()-backed mock with
 * sensible defaults that can be overridden per-test.
 */
import { vi, type Mock } from 'vitest';
import WarpStream from '../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../src/domain/types/codec/CodecValue.ts';
import CodecPort from '../../src/ports/CodecPort.ts';

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
  readTreeOids: Mock<(treeOid: string) => Promise<Record<string, string>>>;
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
  const refs = new Map<string, string>();
  return {
    readRef: vi.fn(async (ref: string) => refs.get(ref) ?? null),
    updateRef: vi.fn(async (ref: string, oid: string) => {
      refs.set(ref, oid);
    }),
    deleteRef: vi.fn(async (ref: string) => {
      refs.delete(ref);
    }),
    listRefs: vi.fn().mockResolvedValue([]),
    compareAndSwapRef: vi.fn(async (ref: string, newOid: string, expectedOid: string | null) => {
      const actualOid = refs.get(ref) ?? null;
      if (actualOid !== expectedOid) {
        throw new Error(`CAS mismatch for ${ref}`);
      }
      refs.set(ref, newOid);
    }),
    readBlob: vi.fn().mockResolvedValue(new Uint8Array(0)),
    writeBlob: vi.fn().mockResolvedValue(MOCK_OID),
    readTree: vi.fn().mockResolvedValue({}),
    readTreeOids: vi.fn(async (_treeOid: string): Promise<Record<string, string>> => ({})),
    writeTree: vi.fn().mockResolvedValue(MOCK_OID),
    commitNode: vi.fn().mockResolvedValue(MOCK_OID),
    commitNodeWithTree: vi.fn().mockResolvedValue(MOCK_OID),
    showNode: vi.fn().mockResolvedValue(''),
    getNodeInfo: vi.fn().mockResolvedValue({ sha: MOCK_OID, message: '', author: '', date: '', parents: [] }),
    getCommitTree: vi.fn().mockResolvedValue(MOCK_OID),
    logNodes: vi.fn().mockResolvedValue(''),
    logNodesStream: vi.fn().mockResolvedValue(WarpStream.from<Uint8Array | string>({ [Symbol.asyncIterator]: async function* () { /* empty */ } })),
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
  encode: Mock<(value: CodecValue) => Uint8Array>;
  decode: Mock<(bytes: Uint8Array) => CodecValue>;
}

const TEXT_ENCODER = new TextEncoder();
const TEXT_DECODER = new TextDecoder();

function encodeLength(length: number): Uint8Array {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, length);
  return bytes;
}

function concatBytes(chunks: ReadonlyArray<Uint8Array>): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

function tagged(tag: string, ...chunks: Uint8Array[]): Uint8Array {
  return concatBytes([TEXT_ENCODER.encode(tag), ...chunks]);
}

function encodeText(value: string): Uint8Array {
  const text = TEXT_ENCODER.encode(value);
  return concatBytes([encodeLength(text.length), text]);
}

function fakeEncode(value: CodecValue): Uint8Array {
  if (value === undefined) {
    return tagged('u');
  }
  if (value === null) {
    return tagged('n');
  }
  if (typeof value === 'boolean') {
    return tagged(value ? 't' : 'f');
  }
  if (typeof value === 'number') {
    return tagged('d', encodeText(String(value)));
  }
  if (typeof value === 'bigint') {
    return tagged('i', encodeText(String(value)));
  }
  if (typeof value === 'string') {
    return tagged('s', encodeText(value));
  }
  if (value instanceof Uint8Array) {
    return tagged('b', encodeLength(value.length), value);
  }
  if (value instanceof Date) {
    return tagged('z', encodeText(value.toISOString()));
  }
  if (Array.isArray(value)) {
    return tagged('a', encodeLength(value.length), ...value.map(fakeEncode));
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return tagged(
    'o',
    encodeLength(entries.length),
    ...entries.flatMap(([key, entryValue]) => [encodeText(key), fakeEncode(entryValue)]),
  );
}

interface DecodeCursor {
  offset: number;
}

function readLength(bytes: Uint8Array, cursor: DecodeCursor): number {
  const length = new DataView(bytes.buffer, bytes.byteOffset + cursor.offset, 4).getUint32(0);
  cursor.offset += 4;
  return length;
}

function readText(bytes: Uint8Array, cursor: DecodeCursor): string {
  const length = readLength(bytes, cursor);
  const text = TEXT_DECODER.decode(bytes.subarray(cursor.offset, cursor.offset + length));
  cursor.offset += length;
  return text;
}

function readBytes(bytes: Uint8Array, cursor: DecodeCursor): Uint8Array {
  const length = readLength(bytes, cursor);
  const chunk = bytes.slice(cursor.offset, cursor.offset + length);
  cursor.offset += length;
  return chunk;
}

function fakeDecodeValue(bytes: Uint8Array, cursor: DecodeCursor): CodecValue {
  const tag = TEXT_DECODER.decode(bytes.subarray(cursor.offset, cursor.offset + 1));
  cursor.offset += 1;

  if (tag === 'u') {
    return undefined;
  }
  if (tag === 'n') {
    return null;
  }
  if (tag === 't') {
    return true;
  }
  if (tag === 'f') {
    return false;
  }
  if (tag === 'd') {
    return Number(readText(bytes, cursor));
  }
  if (tag === 'i') {
    return BigInt(readText(bytes, cursor));
  }
  if (tag === 's') {
    return readText(bytes, cursor);
  }
  if (tag === 'b') {
    return readBytes(bytes, cursor);
  }
  if (tag === 'z') {
    return new Date(readText(bytes, cursor));
  }
  if (tag === 'a') {
    const length = readLength(bytes, cursor);
    const values: CodecValue[] = [];
    for (let index = 0; index < length; index += 1) {
      values.push(fakeDecodeValue(bytes, cursor));
    }
    return values;
  }
  if (tag === 'o') {
    const length = readLength(bytes, cursor);
    const record: Record<string, CodecValue> = {};
    for (let index = 0; index < length; index += 1) {
      const key = readText(bytes, cursor);
      record[key] = fakeDecodeValue(bytes, cursor);
    }
    return record;
  }
  throw new Error(`Unknown fake codec tag: ${tag}`);
}

function fakeDecode(bytes: Uint8Array): CodecValue {
  return fakeDecodeValue(bytes, { offset: 0 });
}

export class FakeCodecPort extends CodecPort {
  encode<TEncoded = CodecValue>(data: TEncoded): Uint8Array {
    return fakeEncode(data as CodecValue);
  }

  decode<TDecoded = CodecValue>(bytes: Uint8Array): TDecoded {
    return fakeDecode(bytes) as TDecoded;
  }
}

export function createFakeCodecPort(): CodecPort {
  return new FakeCodecPort();
}

export function createMockCodec(overrides: Partial<MockCodec> = {}): MockCodec {
  return {
    encode: vi.fn((value: CodecValue): Uint8Array => fakeEncode(value)),
    decode: vi.fn((bytes: Uint8Array): CodecValue => fakeDecode(bytes)),
    ...overrides,
  };
}

/** Stub codec that passes through without real serialization. */
export function createStubCodec(): MockCodec {
  return {
    encode: vi.fn(() => new Uint8Array([1])),
    decode: vi.fn((_bytes: Uint8Array): CodecValue => ({})),
  };
}

// ---------------------------------------------------------------------------
// Mock Crypto (CryptoPort surface)
// ---------------------------------------------------------------------------

export interface MockCrypto {
  hash: Mock;
  hmac: Mock;
  timingSafeEqual: Mock;
}

const MOCK_HASH = 'abcdef'.repeat(10) + 'abcd';

function cryptoBytes(value: string | Uint8Array): Uint8Array {
  return typeof value === 'string' ? TEXT_ENCODER.encode(value) : value;
}

function fakeDigestBytes(parts: ReadonlyArray<string | Uint8Array>): Uint8Array {
  const digest = new Uint8Array(32);
  let state = 2166136261;
  let offset = 0;
  for (const part of parts) {
    const bytes = cryptoBytes(part);
    for (const byte of bytes) {
      state ^= byte;
      state = Math.imul(state, 16777619);
      const primaryIndex = offset % digest.length;
      const secondaryIndex = (offset * 7 + 3) % digest.length;
      digest[primaryIndex] = (digest[primaryIndex] ?? 0) ^ (state & 0xff);
      digest[secondaryIndex] = (digest[secondaryIndex] ?? 0) ^ ((state >>> 8) & 0xff);
      offset += 1;
    }
  }
  return digest;
}

function fakeDigestHex(parts: ReadonlyArray<string | Uint8Array>): string {
  return Array.from(fakeDigestBytes(parts), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createMockCrypto(overrides: Partial<MockCrypto> = {}): MockCrypto {
  return {
    hash: vi.fn(async (algorithm: string, data: string | Uint8Array) => fakeDigestHex([algorithm, data])),
    hmac: vi.fn(async (algorithm: string, key: string | Uint8Array, data: string | Uint8Array) => fakeDigestBytes([algorithm, key, data])),
    timingSafeEqual: vi.fn((left: Uint8Array, right: Uint8Array) => {
      if (left.length !== right.length) {
        return false;
      }
      let diff = 0;
      for (let index = 0; index < left.length; index += 1) {
        diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
      }
      return diff === 0;
    }),
    ...overrides,
  };
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
