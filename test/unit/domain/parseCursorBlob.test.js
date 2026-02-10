import { describe, it, expect } from 'vitest';
import { parseCursorBlob } from '../../../src/domain/utils/parseCursorBlob.js';

describe('parseCursorBlob', () => {
  /** @param {string} str */
  function buf(str) {
    return Buffer.from(str, 'utf8');
  }

  it('parses a valid cursor blob', () => {
    const result = parseCursorBlob(buf('{"tick":5,"mode":"lamport"}'), 'test cursor');
    expect(result).toEqual({ tick: 5, mode: 'lamport' });
  });

  it('parses a cursor with only tick', () => {
    const result = parseCursorBlob(buf('{"tick":0}'), 'test cursor');
    expect(result).toEqual({ tick: 0 });
  });

  it('preserves extra fields', () => {
    const result = parseCursorBlob(buf('{"tick":3,"mode":"lamport","extra":"ok"}'), 'test');
    expect(result.extra).toBe('ok');
  });

  it('throws on invalid JSON', () => {
    expect(() => parseCursorBlob(buf('not json'), 'active cursor')).toThrow(
      'Corrupted active cursor: blob is not valid JSON'
    );
  });

  it('throws on truncated JSON', () => {
    expect(() => parseCursorBlob(buf('{"tick":'), 'active cursor')).toThrow(
      'blob is not valid JSON'
    );
  });

  it('throws on JSON array', () => {
    expect(() => parseCursorBlob(buf('[1,2,3]'), 'saved cursor')).toThrow(
      'expected a JSON object'
    );
  });

  it('throws on JSON null', () => {
    expect(() => parseCursorBlob(buf('null'), 'saved cursor')).toThrow(
      'expected a JSON object'
    );
  });

  it('throws on missing tick', () => {
    expect(() => parseCursorBlob(buf('{"mode":"lamport"}'), "saved cursor 'foo'")).toThrow(
      "Corrupted saved cursor 'foo': missing or invalid numeric tick"
    );
  });

  it('throws on non-numeric tick', () => {
    expect(() => parseCursorBlob(buf('{"tick":"5"}'), 'active cursor')).toThrow(
      'missing or invalid numeric tick'
    );
  });

  it('throws on NaN tick', () => {
    expect(() => parseCursorBlob(buf('{"tick":null}'), 'active cursor')).toThrow(
      'missing or invalid numeric tick'
    );
  });

  it('throws on boolean tick', () => {
    expect(() => parseCursorBlob(buf('{"tick":true}'), 'cursor')).toThrow(
      'missing or invalid numeric tick'
    );
  });
});
