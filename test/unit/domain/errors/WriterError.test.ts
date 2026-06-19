import { describe, it, expect } from 'vitest';
import WriterError from '../../../../src/domain/errors/WriterError.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('WriterError', () => {
  it('extends WarpError', () => {
    const err = new WriterError('test message', { code: 'TEST_CODE' });
    expect(err).toBeInstanceOf(WarpError);
  });

  it('extends Error', () => {
    const err = new WriterError('test message', { code: 'TEST_CODE' });
    expect(err).toBeInstanceOf(Error);
  });

  it('has name set to WriterError', () => {
    const err = new WriterError('test message', { code: 'TEST_CODE' });
    expect(err.name).toBe('WriterError');
  });

  it('uses code option', () => {
    const err = new WriterError('no ops', { code: 'EMPTY_PATCH' });
    expect(err.code).toBe('EMPTY_PATCH');
  });

  it('sets message from first argument', () => {
    const err = new WriterError('the message', { code: 'CODE' });
    expect(err.message).toBe('the message');
  });

  it('preserves cause when provided', () => {
    const cause = new Error('original');
    const err = new WriterError('wrapped error', { code: 'WRAPPED', cause });
    expect(err.cause).toBe(cause);
  });

  it('does not set cause when omitted', () => {
    const err = new WriterError('msg', { code: 'CODE' });
    expect(err.cause).toBeUndefined();
  });

  it('has a stack trace', () => {
    const err = new WriterError('msg', { code: 'CODE' });
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('WriterError');
  });

  it('defaults code to WRITER_ERROR when code option is omitted', () => {
    const err = new WriterError('msg');
    expect(err.code).toBe('WRITER_ERROR');
  });

  it('preserves context when provided', () => {
    const err = new WriterError('msg', { code: 'CODE', context: { detail: 'test' } });
    expect(err.context).toEqual({ detail: 'test' });
  });
});

describe('WriterError backward compat re-export from Writer.js', () => {
  it('import { WriterError } from Writer.js still works', async () => {
    const mod = await import('../../../../src/domain/warp/Writer.ts');
    expect(mod.WriterError).toBe(WriterError);
  });
});
