import { describe, it, expect } from 'vitest';
import WriterError from '../../../../src/domain/errors/WriterError.js';
import WarpError from '../../../../src/domain/errors/WarpError.js';

describe('WriterError', () => {
  it('extends WarpError', () => {
    const err = new WriterError('TEST_CODE', 'test message');
    expect(err).toBeInstanceOf(WarpError);
  });

  it('extends Error', () => {
    const err = new WriterError('TEST_CODE', 'test message');
    expect(err).toBeInstanceOf(Error);
  });

  it('has name set to WriterError', () => {
    const err = new WriterError('TEST_CODE', 'test message');
    expect(err.name).toBe('WriterError');
  });

  it('uses positional code argument', () => {
    const err = new WriterError('EMPTY_PATCH', 'no ops');
    expect(err.code).toBe('EMPTY_PATCH');
  });

  it('sets message from second argument', () => {
    const err = new WriterError('CODE', 'the message');
    expect(err.message).toBe('the message');
  });

  it('preserves cause when provided', () => {
    const cause = new Error('original');
    const err = new WriterError('WRAPPED', 'wrapped error', cause);
    expect(err.cause).toBe(cause);
  });

  it('does not set cause when omitted', () => {
    const err = new WriterError('CODE', 'msg');
    expect(err.cause).toBeUndefined();
  });

  it('has a stack trace', () => {
    const err = new WriterError('CODE', 'msg');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('WriterError');
  });

  it('defaults code to WRITER_ERROR when first arg is falsy', () => {
    const err = new WriterError('', 'msg');
    expect(err.code).toBe('WRITER_ERROR');
  });
});

describe('WriterError backward compat re-export from Writer.js', () => {
  it('import { WriterError } from Writer.js still works', async () => {
    const mod = await import('../../../../src/domain/warp/Writer.js');
    expect(mod.WriterError).toBe(WriterError);
  });
});
