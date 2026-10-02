import { describe, expect, it } from 'vitest';
import StagedContent from '../../../src/domain/api/StagedContent.ts';

describe('StagedContent', () => {
  it('snapshots immutable identity and plaintext metadata without retaining bytes', () => {
    const fields = { id: 'content:one', mime: 'application/octet-stream', size: 3 };
    const content = new StagedContent(fields);
    fields.id = 'content:two';
    fields.mime = 'text/plain';
    fields.size = 99;
    expect(content).toEqual({ id: 'content:one', mime: 'application/octet-stream', size: 3 });
    expect(Object.isFrozen(content)).toBe(true);
  });

  it('permits an empty payload with absent MIME metadata', () => {
    expect(new StagedContent({ id: 'content:empty', mime: null, size: 0 }))
      .toEqual({ id: 'content:empty', mime: null, size: 0 });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'rejects an invalid plaintext byte count %s', (size) => {
      expect(() => new StagedContent({ id: 'content:one', mime: null, size }))
        .toThrow(expect.objectContaining({ code: 'E_CONTENT_SIZE' }));
    },
  );

  it.each(['', 'bad\0mime'])('rejects invalid MIME metadata %j', (mime) => {
    expect(() => new StagedContent({ id: 'content:one', mime, size: 1 })).toThrow();
  });

  it('rejects an empty identity', () => {
    expect(() => new StagedContent({ id: '', mime: null, size: 0 })).toThrow();
  });

  it.each([null, undefined])('rejects absent metadata %s', (fields) => {
    expect(() => new StagedContent(fields))
      .toThrow(expect.objectContaining({ code: 'E_CONTENT_METADATA' }));
  });

  it('reads caller accessors once before validating the captured identity', () => {
    let calls = 0;
    const content = new StagedContent({
      get id() { calls += 1; return calls === 1 ? 'content:one' : ''; },
      mime: null,
      size: 0,
    });
    expect(content.id).toBe('content:one');
    expect(calls).toBe(1);
  });
});
