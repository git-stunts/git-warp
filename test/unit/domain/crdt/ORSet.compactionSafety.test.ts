import { describe, expect, it } from 'vitest';
import ORSet from '../../../../src/domain/crdt/ORSet.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import CrdtError from '../../../../src/domain/errors/CrdtError.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import executeGC from '../../../../src/domain/services/executeGC.ts';
import { decodeCanonicalWarpFullState, encodeWarpFullState } from '../../../../src/infrastructure/adapters/WarpStateCborCodec.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const APPLIED = VersionVector.from({ A: 100, B: 100 });
const REMOVED = new Dot('A', 1);
const CONCURRENT = new Dot('B', 1);

describe('ORSet compaction safety', () => {
  it('refuses malformed dots without installing an addition', () => {
    const set = ORSet.empty();
    // @ts-expect-error intentional malformed dot boundary witness
    expect(() => set.add('n', null)).toThrow(CrdtError);
    // @ts-expect-error intentional malformed dot boundary witness
    expect(() => set.add('n', undefined)).toThrow(CrdtError);
    // @ts-expect-error intentional malformed dot boundary witness
    expect(() => set.add('n', { writerId: 1, counter: 1 })).toThrow(CrdtError);
    expect(() => set.add('n', { writerId: 'A', counter: 1.5 })).toThrow(CrdtError);
    expect(set.countEntries()).toBe(0);
  });

  it('rejects stale additions in both join directions and during direct replay', () => {
    const removed = ORSet.empty();
    removed.add('n', REMOVED);
    const stale = removed.clone();
    removed.remove(removed.getDots('n'));
    removed.compact(APPLIED);

    expect(removed.join(stale).contains('n')).toBe(false);
    expect(stale.join(removed).contains('n')).toBe(false);
    removed.add('n', REMOVED);
    expect(removed.contains('n')).toBe(false);
    expect(removed.hasEntries('n')).toBe(true);
    expect(removed.countEntries()).toBe(1);
    expect(removed.countTombstones()).toBe(1);
  });

  it('preserves unobserved additions even when the applied vector covers their dots', () => {
    const removed = ORSet.empty();
    removed.add('n', REMOVED);
    removed.remove(removed.getDots('n'));
    const concurrent = ORSet.empty();
    concurrent.add('n', REMOVED);
    concurrent.add('n', CONCURRENT);

    removed.compact(APPLIED);
    const joined = removed.join(concurrent);
    joined.compact(APPLIED);
    expect(joined.getDots('n')).toEqual(new Set([Dot.encode(CONCURRENT)]));
    expect(concurrent.join(removed).getDots('n')).toEqual(joined.getDots('n'));
    expect(joined.join(removed).getDots('n')).toEqual(joined.getDots('n'));
  });

  it('preserves floating removal evidence before a delayed addition arrives', () => {
    const set = ORSet.empty();
    set.remove(new Set([Dot.encode(REMOVED)]));
    set.compact(APPLIED);
    const cloned = set.clone();
    cloned.add('n', REMOVED);
    expect(cloned.contains('n')).toBe(false);
    cloned.add('n', CONCURRENT);
    expect(cloned.getDots('n')).toEqual(new Set([Dot.encode(CONCURRENT)]));
  });

  it('retains removal evidence through scoped clones and raw entry iteration', () => {
    const original = ORSet.empty();
    original.add('removed', REMOVED);
    original.add('keep', CONCURRENT);
    original.remove(original.getDots('removed'));
    original.compact(APPLIED);
    expect([...original.entryDotsIter()]).toEqual([Dot.encode(REMOVED), Dot.encode(CONCURRENT)]);
    expect(original.hasDot('removed', Dot.encode(REMOVED))).toBe(true);
    expect(original.hasDot('removed', Dot.encode(CONCURRENT))).toBe(false);
    expect(original.hasDot('absent', Dot.encode(REMOVED))).toBe(false);
    const scoped = original.scopedClone((element) => element === 'keep');
    scoped.compact(APPLIED);
    expect([...scoped.entryDotsIter()]).toEqual([Dot.encode(CONCURRENT)]);
    expect([...scoped.tombstonesIter()]).toEqual([Dot.encode(REMOVED)]);
    scoped.add('removed', REMOVED);
    expect(scoped.contains('removed')).toBe(false);
    scoped.add('keep', new Dot('B', 2));
    expect(original.getDots('keep')).toEqual(new Set([Dot.encode(CONCURRENT)]));
  });

  it('keeps node and edge membership equivalent through GC, checkpoint round trips and every join order', () => {
    const original = createEmptyState();
    const edge = 'a\0b\0rel';
    original.nodeAlive.add('n', REMOVED);
    original.edgeAlive.add(edge, REMOVED);
    const stale = original.clone();
    original.nodeAlive.remove(new Set([Dot.encode(REMOVED)]));
    original.edgeAlive.remove(new Set([Dot.encode(REMOVED)]));
    const concurrent = stale.clone();
    concurrent.nodeAlive.add('n', CONCURRENT);
    concurrent.edgeAlive.add(edge, CONCURRENT);
    const collected = original.clone();
    collected.nodeAlive.compact(APPLIED);
    collected.edgeAlive.compact(APPLIED);
    expect(executeGC(collected, APPLIED).tombstonesRemoved).toBe(0);
    const restored = decodeCanonicalWarpFullState(encodeWarpFullState(collected, codec), codec);

    for (const state of [restored.join(stale), stale.join(restored)]) {
      expect(state.nodeAlive.contains('n')).toBe(false);
      expect(state.edgeAlive.contains(edge)).toBe(false);
    }
    const permutations: readonly (readonly [WarpState, WarpState, WarpState])[] = [
      [restored, stale, concurrent], [restored, concurrent, stale],
      [stale, restored, concurrent], [stale, concurrent, restored],
      [concurrent, restored, stale], [concurrent, stale, restored],
    ];
    for (const [left, middle, right] of permutations) {
      for (const state of [left.join(middle).join(right), left.join(middle.join(right))]) {
        expect(state.nodeAlive.getDots('n')).toEqual(new Set([Dot.encode(CONCURRENT)]));
        expect(state.edgeAlive.getDots(edge)).toEqual(new Set([Dot.encode(CONCURRENT)]));
        expect(state.nodeAlive.isTombstoned(Dot.encode(REMOVED))).toBe(true);
        expect(state.edgeAlive.isTombstoned(Dot.encode(REMOVED))).toBe(true);
      }
    }
  });
});
