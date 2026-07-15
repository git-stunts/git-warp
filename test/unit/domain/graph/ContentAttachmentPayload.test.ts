import { describe, expect, it } from 'vitest';

import ContentAttachmentMime from '../../../../src/domain/graph/ContentAttachmentMime.ts';
import ContentAttachmentHandle from '../../../../src/domain/graph/ContentAttachmentHandle.ts';
import ContentAttachmentPayload from '../../../../src/domain/graph/ContentAttachmentPayload.ts';
import ContentAttachmentSize from '../../../../src/domain/graph/ContentAttachmentSize.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

describe('ContentAttachmentPayload graph substrate nouns', () => {
  it('validates opaque handles as runtime-backed attachment references', () => {
    const handle = new ContentAttachmentHandle('abc123');

    expect(handle.toString()).toBe('abc123');
    expect(handle.equals(new ContentAttachmentHandle('abc123'))).toBe(true);
    expect(handle.equals(new ContentAttachmentHandle('def456'))).toBe(false);
    expect(handle.equals(null)).toBe(false);
    expect(Object.isFrozen(handle)).toBe(true);
    expect(() => new ContentAttachmentHandle('')).toThrow(WarpError);
    expect(() => new ContentAttachmentHandle('bad\0handle')).toThrow(WarpError);
  });

  it('validates optional MIME hints as runtime-backed metadata', () => {
    const mime = new ContentAttachmentMime('text/markdown');

    expect(mime.toString()).toBe('text/markdown');
    expect(mime.equals(new ContentAttachmentMime('text/markdown'))).toBe(true);
    expect(mime.equals(new ContentAttachmentMime('text/plain'))).toBe(false);
    expect(mime.equals(undefined)).toBe(false);
    expect(Object.isFrozen(mime)).toBe(true);
    expect(() => new ContentAttachmentMime('')).toThrow(WarpError);
    expect(() => new ContentAttachmentMime('text/\0plain')).toThrow(WarpError);
  });

  it('validates content sizes as runtime-backed byte lengths', () => {
    const size = new ContentAttachmentSize(42);

    expect(size.toNumber()).toBe(42);
    expect(size.equals(new ContentAttachmentSize(42))).toBe(true);
    expect(size.equals(new ContentAttachmentSize(43))).toBe(false);
    expect(size.equals(null)).toBe(false);
    expect(Object.isFrozen(size)).toBe(true);
    expect(() => new ContentAttachmentSize(-1)).toThrow(WarpError);
    expect(() => new ContentAttachmentSize(1.5)).toThrow(WarpError);
  });

  it('represents typed content attachment payload metadata', () => {
    const payload = new ContentAttachmentPayload({
      handle: new ContentAttachmentHandle('abc123'),
      mime: new ContentAttachmentMime('text/markdown'),
      size: new ContentAttachmentSize(42),
    });

    expect(payload.handle.toString()).toBe('abc123');
    expect(payload.mime?.toString()).toBe('text/markdown');
    expect(payload.size?.toNumber()).toBe(42);
    expect(payload.hasMime()).toBe(true);
    expect(payload.hasSize()).toBe(true);
    expect(Object.isFrozen(payload)).toBe(true);
  });

  it('allows absent MIME and size metadata without losing the handle', () => {
    const payload = new ContentAttachmentPayload({
      handle: new ContentAttachmentHandle('abc123'),
      mime: null,
      size: null,
    });

    expect(payload.handle.toString()).toBe('abc123');
    expect(payload.mime).toBeNull();
    expect(payload.size).toBeNull();
    expect(payload.hasMime()).toBe(false);
    expect(payload.hasSize()).toBe(false);
  });

  it('rejects fake payload envelopes', () => {
    expect(() => {
      // @ts-expect-error exercising runtime validation
      new ContentAttachmentPayload(null);
    }).toThrow(WarpError);
    expect(() => {
      new ContentAttachmentPayload({
        // @ts-expect-error exercising runtime validation
        handle: 'abc123',
        mime: null,
        size: null,
      });
    }).toThrow(WarpError);
    expect(() => {
      new ContentAttachmentPayload({
        handle: new ContentAttachmentHandle('abc123'),
        // @ts-expect-error exercising runtime validation
        mime: 'text/plain',
        size: null,
      });
    }).toThrow(WarpError);
    expect(() => {
      new ContentAttachmentPayload({
        handle: new ContentAttachmentHandle('abc123'),
        mime: null,
        // @ts-expect-error exercising runtime validation
        size: 42,
      });
    }).toThrow(WarpError);
  });
});
