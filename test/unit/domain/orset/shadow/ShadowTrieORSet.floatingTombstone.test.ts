/**
 * #1119: the trie-backed OR-set keeps a tombstone for an observed dot that
 * has not arrived yet, under the named element, so a remove that is
 * replayed before the add it observed still deletes that add.
 */

import { describe, expect, it, vi } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import TrieCursor from '../../../../../src/domain/orset/trie/TrieCursor.ts';
import TrieFlusher from '../../../../../src/domain/orset/trie/TrieFlusher.ts';
import TrieGeometry from '../../../../../src/domain/orset/trie/TrieGeometry.ts';
import ShadowTrieORSet from '../../../../../src/domain/orset/shadow/ShadowTrieORSet.ts';
import cborCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import { InMemoryTrieStore } from '../../../../helpers/trieHelpers.ts';

function engineOn(store: InMemoryTrieStore, rootOid: string | null = null): ShadowTrieORSet {
  const cursor = new TrieCursor({ rootOid, store, geometry: TrieGeometry.default16way(), codec: cborCodec });
  return new ShadowTrieORSet({ cursor, flusher: new TrieFlusher({ store, codec: cborCodec }) });
}

const EARLY = new Dot('zed', 1);
const OTHER = new Dot('zed', 2);

describe('ShadowTrieORSet floating tombstones (#1119)', () => {
  it('a remove before the add of an absent element still deletes that add', async () => {
    const engine = engineOn(new InMemoryTrieStore());
    await engine.removeElement('n1', new Set([encodeDot(EARLY)]));
    expect(await engine.contains('n1')).toBe(false);
    expect([...(await engine.getElementState('n1'))?.tombstonedDots ?? []]).toEqual([encodeDot(EARLY)]);
    await engine.add('n1', EARLY);
    expect(await engine.contains('n1')).toBe(false);
  });

  it('a remove of a dot the element does not hold yet deletes only that later add', async () => {
    const engine = engineOn(new InMemoryTrieStore());
    await engine.add('n1', OTHER);
    await engine.removeElement('n1', new Set([encodeDot(EARLY)]));
    expect(await engine.contains('n1')).toBe(true);
    await engine.add('n1', EARLY);
    expect([...await engine.getDots('n1')]).toEqual([encodeDot(OTHER)]);
  });

  it('keeps the floating tombstone across flush and reopen', async () => {
    const store = new InMemoryTrieStore();
    const engine = engineOn(store);
    await engine.removeElement('n1', new Set([encodeDot(EARLY)]));
    const { rootOid } = await engine.flush();
    const reopened = engineOn(store, rootOid);
    await reopened.add('n1', EARLY);
    expect(await reopened.contains('n1')).toBe(false);
  });

  it('does not reserve an already tombstoned dot twice, and ignores an empty remove', async () => {
    const engine = engineOn(new InMemoryTrieStore());
    await engine.add('n1', EARLY);
    await engine.removeElement('n1', new Set([encodeDot(EARLY)]));
    await engine.removeElement('n1', new Set([encodeDot(EARLY)]));
    await engine.removeElement('n2', new Set());
    expect([...(await engine.getElementState('n1'))?.tombstonedDots ?? []]).toEqual([encodeDot(EARLY)]);
    expect(await engine.getElementState('n2')).toBeNull();
  });

  it('skips an observed string that is not a canonical dot, because no add can carry it', async () => {
    const engine = engineOn(new InMemoryTrieStore());
    await engine.removeElement('n1', new Set(['not-a-dot']));
    expect(await engine.getElementState('n1')).toBeNull();
  });

  it('rethrows a decode failure that is not a CRDT format error', async () => {
    const engine = engineOn(new InMemoryTrieStore());
    const spy = vi.spyOn(Dot, 'decode').mockImplementation(() => { throw new RangeError('unexpected'); });
    try {
      await expect(engine.removeElement('n1', new Set(['zed:1']))).rejects.toThrow(RangeError);
    } finally {
      spy.mockRestore();
    }
  });
});
