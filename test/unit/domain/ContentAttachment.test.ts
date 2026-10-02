import { describe, expect, it } from 'vitest';
import ContentAttachment from '../../../src/domain/api/ContentAttachment.ts';
import ContentOwner from '../../../src/domain/api/ContentOwner.ts';
import { createNodeContentObserver, createEdgeContentObserver, contentObserverOwner } from '../../../src/domain/api/ContentObserverRuntime.ts';
import { decodeObserverValue } from '../../../src/domain/api/ObserverRuntime.ts';
import Observer from '../../../src/domain/api/Observer.ts';
import { snapshotReadingValue } from '../../../src/domain/api/ReadingValueRuntime.ts';

async function* bytes() { yield new Uint8Array([1]); }
const fields = { id: 'content:one', mime: 'text/plain', size: 1, owner: { kind: 'node', subject: 'n' }, open: bytes };
function attachment() {
  return new ContentAttachment({ ...fields, owner: { kind: 'node', subject: 'n' } });
}

describe('ContentAttachment', () => {
  it('freezes owner metadata without losing its stream capability during snapshotting', async () => {
    const content = attachment();
    expect(Object.isFrozen(content)).toBe(true);
    expect(Object.isFrozen(content.owner)).toBe(true);
    expect(snapshotReadingValue(content)).toBe(content);
    expect(await content.open()[Symbol.asyncIterator]().next()).toEqual({ value: new Uint8Array([1]), done: false });
    expect(new ContentAttachment({ ...content, mime: null, size: null, open: bytes }).size).toBeNull();
  });

  it('rejects missing fields, invalid metadata and absent stream capability', () => {
    expect(() => new ContentAttachment(null)).toThrow();
    expect(() => new ContentAttachment(undefined)).toThrow();
    for (const size of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => new ContentAttachment({ ...attachment(), size, open: bytes })).toThrow();
    }
    expect(() => new ContentAttachment({ ...attachment(), id: '', open: bytes })).toThrow();
    // @ts-expect-error Deliberately invalid public boundary value.
    expect(() => new ContentAttachment({ ...attachment(), open: null })).toThrow();
  });

  it('validates and snapshots node and edge owners', () => {
    expect(() => new ContentOwner(null)).toThrow();
    expect(() => new ContentOwner(undefined)).toThrow();
    // @ts-expect-error Unsupported owner kind must fail at runtime.
    expect(() => new ContentOwner({ kind: 'recursive' })).toThrow();
    expect(() => new ContentOwner({ kind: 'node', subject: 'n\0x' })).toThrow();
    const edge = { from: 'a', to: 'b', label: 'e' };
    const observer = createEdgeContentObserver(edge);
    edge.label = 'changed';
    expect(contentObserverOwner(observer)?.descriptor).toEqual({ kind: 'edge', from: 'a', to: 'b', label: 'e' });
    expect(() => createEdgeContentObserver({ from: '', to: 'b', label: 'e' })).toThrow();
    // @ts-expect-error Missing fields must fail at runtime.
    expect(() => createNodeContentObserver(null)).toThrow();
  });

  it('accepts only content readings and recognizes only registered observers', () => {
    const observer = createNodeContentObserver({ subject: 'n' });
    const content = attachment();
    expect(decodeObserverValue(observer, content)).toBe(content);
    expect(decodeObserverValue(observer, null)).toBeNull();
    expect(() => decodeObserverValue(observer, 'content:one')).toThrow();
    expect(contentObserverOwner(new Observer({ id: 'other', cardinality: 'exactly-one', decode: value => value }))).toBeNull();
  });
});
