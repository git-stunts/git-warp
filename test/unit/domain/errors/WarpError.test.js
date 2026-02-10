import { describe, it, expect } from 'vitest';
import WarpError from '../../../../src/domain/errors/WarpError.js';
import IndexError from '../../../../src/domain/errors/IndexError.js';
import TraversalError from '../../../../src/domain/errors/TraversalError.js';
import QueryError from '../../../../src/domain/errors/QueryError.js';
import SyncError from '../../../../src/domain/errors/SyncError.js';
import ForkError from '../../../../src/domain/errors/ForkError.js';
import WormholeError from '../../../../src/domain/errors/WormholeError.js';
import SchemaUnsupportedError from '../../../../src/domain/errors/SchemaUnsupportedError.js';
import OperationAbortedError from '../../../../src/domain/errors/OperationAbortedError.js';
import ShardCorruptionError from '../../../../src/domain/errors/ShardCorruptionError.js';
import ShardLoadError from '../../../../src/domain/errors/ShardLoadError.js';
import ShardValidationError from '../../../../src/domain/errors/ShardValidationError.js';
import StorageError from '../../../../src/domain/errors/StorageError.js';
import EmptyMessageError from '../../../../src/domain/errors/EmptyMessageError.js';
import WriterError from '../../../../src/domain/errors/WriterError.js';

describe('WarpError base class', () => {
  it('sets name from constructor', () => {
    const err = new WarpError('test', 'TEST_CODE');
    expect(err.name).toBe('WarpError');
  });

  it('sets code from default', () => {
    const err = new WarpError('test', 'DEFAULT_CODE');
    expect(err.code).toBe('DEFAULT_CODE');
  });

  it('allows code override via options', () => {
    const err = new WarpError('test', 'DEFAULT', { code: 'CUSTOM' });
    expect(err.code).toBe('CUSTOM');
  });

  it('sets context from options', () => {
    const ctx = { key: 'value' };
    const err = new WarpError('test', 'CODE', { context: ctx });
    expect(err.context).toEqual(ctx);
  });

  it('defaults context to empty object', () => {
    const err = new WarpError('test', 'CODE');
    expect(err.context).toEqual({});
  });

  it('is instanceof Error', () => {
    const err = new WarpError('test', 'CODE');
    expect(err).toBeInstanceOf(Error);
  });

  it('has a stack trace', () => {
    const err = new WarpError('test', 'CODE');
    expect(err.stack).toBeDefined();
  });
});

describe('All domain errors extend WarpError', () => {
  const errorCases = [
    { Class: IndexError, args: ['index fail'], expectedCode: 'INDEX_ERROR', expectedName: 'IndexError' },
    { Class: TraversalError, args: ['traversal fail'], expectedCode: 'TRAVERSAL_ERROR', expectedName: 'TraversalError' },
    { Class: QueryError, args: ['query fail'], expectedCode: 'QUERY_ERROR', expectedName: 'QueryError' },
    { Class: SyncError, args: ['sync fail'], expectedCode: 'SYNC_ERROR', expectedName: 'SyncError' },
    { Class: ForkError, args: ['fork fail'], expectedCode: 'FORK_ERROR', expectedName: 'ForkError' },
    { Class: WormholeError, args: ['wormhole fail'], expectedCode: 'WORMHOLE_ERROR', expectedName: 'WormholeError' },
    { Class: SchemaUnsupportedError, args: ['schema fail'], expectedCode: 'E_SCHEMA_UNSUPPORTED', expectedName: 'SchemaUnsupportedError' },
  ];

  for (const { Class: _Class, args, expectedCode, expectedName } of errorCases) {
    /** @type {any} */
    const Class = _Class;
    it(`${expectedName} instanceof WarpError`, () => {
      const err = new Class(...args);
      expect(err).toBeInstanceOf(WarpError);
      expect(err).toBeInstanceOf(Error);
    });

    it(`${expectedName} has correct name`, () => {
      const err = new Class(...args);
      expect(err.name).toBe(expectedName);
    });

    it(`${expectedName} has correct default code`, () => {
      const err = new Class(...args);
      expect(err.code).toBe(expectedCode);
    });

    it(`${expectedName} has correct context`, () => {
      const err = new Class(args[0], { context: { detail: 'test' } });
      expect(err.context).toEqual({ detail: 'test' });
    });
  }

  it('WriterError instanceof WarpError', () => {
    const err = new WriterError('EMPTY_PATCH', 'no ops');
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('WriterError');
    expect(err.code).toBe('EMPTY_PATCH');
  });

  it('OperationAbortedError instanceof WarpError', () => {
    const err = new OperationAbortedError('test-op');
    expect(err).toBeInstanceOf(WarpError);
    expect(err.name).toBe('OperationAbortedError');
    expect(err.code).toBe('OPERATION_ABORTED');
    expect(err.operation).toBe('test-op');
    expect(err.reason).toBe('Operation was aborted');
  });

  it('OperationAbortedError preserves custom reason', () => {
    const err = new OperationAbortedError('test-op', { reason: 'Signal received' });
    expect(err.message).toBe("Operation 'test-op' aborted: Signal received");
    expect(err.reason).toBe('Signal received');
  });
});

describe('IndexError subclasses extend WarpError', () => {
  it('ShardCorruptionError instanceof WarpError', () => {
    const err = new ShardCorruptionError('corrupt', { shardPath: '/a', oid: 'x', reason: 'bad' });
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(IndexError);
    expect(err.name).toBe('ShardCorruptionError');
    expect(err.code).toBe('SHARD_CORRUPTION_ERROR');
    expect(err.shardPath).toBe('/a');
  });

  it('ShardLoadError instanceof WarpError', () => {
    const err = new ShardLoadError('load fail', { shardPath: '/a', oid: 'x' });
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(IndexError);
    expect(err.name).toBe('ShardLoadError');
  });

  it('ShardValidationError instanceof WarpError', () => {
    const err = new ShardValidationError('validation', { expected: 1, actual: 2, field: 'v' });
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(IndexError);
    expect(err.name).toBe('ShardValidationError');
  });

  it('StorageError instanceof WarpError', () => {
    const err = new StorageError('storage fail', { operation: 'read', oid: 'x' });
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(IndexError);
    expect(err.name).toBe('StorageError');
  });

  it('EmptyMessageError instanceof WarpError', () => {
    const err = new EmptyMessageError('empty', { operation: 'create' });
    expect(err).toBeInstanceOf(WarpError);
    expect(err).toBeInstanceOf(IndexError);
    expect(err.name).toBe('EmptyMessageError');
  });
});
