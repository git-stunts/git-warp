import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import ObservedWriterHead from '../../../../src/domain/types/ObservedWriterHead.ts';
import ObservedWriteFrontier from '../../../../src/domain/types/ObservedWriteFrontier.ts';
import ObservedWriteBasis from '../../../../src/domain/services/ObservedWriteBasis.ts';
import captureObservedWriteBasis from '../../../../src/domain/services/captureObservedWriteBasis.ts';
import InvalidWriteObservationError from '../../../../src/domain/errors/InvalidWriteObservationError.ts';
import ObservationJournal from '../../../helpers/ObservationJournal.ts';
import { createPatchBuilderMockPersistence } from './PatchBuilderTestHarness.ts';

const A = 'a-tip';
const B = 'b-parent';
const ref = (writer: string): string => 'refs/warp/L/writers/' + writer;
function frame(writer: string, sha: string, lamport: number, counter: number): PatchEntry {
  return new PatchEntry({ sha, patch: new Patch({
    writer, lamport, context: { [writer]: counter }, ops: [
      new NodeAdd('n-' + writer, new Dot(writer, counter)),
      new EdgeAdd({ from: 'n-' + writer, to: 'other', label: 'link', dot: new Dot(writer, counter + 1) }),
    ],
  }) });
}

describe('coherent inspected write basis', () => {
  it('joins actual counters independently of clocks and closes after one frame per writer', async () => {
    const refs = createPatchBuilderMockPersistence();
    refs.listRefs.mockResolvedValue([ref('a')]);
    refs.readRef.mockResolvedValue(A);
    const journal = new ObservationJournal(new Map([[A, frame('a', A, 21, 7)], [B, frame('b', B, 9, 3)]]));
    const original = VersionVector.from({ c: 2 });
    const basis = await captureObservedWriteBasis({
      refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: B, ownCandidate: 10, context: original,
    });
    expect(basis.lamport).toBe(22);
    expect(VersionVector.serialize(basis.context())).toEqual({ a: 8, b: 4, c: 2 });
    expect(basis.observation.frontier()).toEqual(new Map([['a', A], ['b', B]]));
    expect(basis.coordinateRef).toContain(A);
    expect(journal.scans).toEqual([['a', A], ['b', B]]);
    expect(journal.closed).toBe(2);
    original.set('c', 99);
    basis.context().set('a', 100);
    basis.observation.frontier().set('a', 'different');
    expect(VersionVector.serialize(basis.context())).toEqual({ a: 8, b: 4, c: 2 });
    expect(basis.observation.frontier().get('a')).toBe(A);
  });

  it('pins its own immutable predecessor despite a concurrent ref change', async () => {
    const refs = createPatchBuilderMockPersistence();
    refs.listRefs.mockResolvedValue([ref('b')]);
    refs.readRef.mockResolvedValue('b-new');
    const journal = new ObservationJournal(new Map([[B, frame('b', B, 8, 2)]]));
    const basis = await captureObservedWriteBasis({
      refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: B, ownCandidate: 9, context: VersionVector.empty(),
    });
    expect(basis.observation.frontier()).toEqual(new Map([['b', B]]));
    expect(journal.scans).toEqual([['b', B]]);
  });

  it('does not call a same-writer genesis contender an observed predecessor', async () => {
    const refs = createPatchBuilderMockPersistence();
    refs.listRefs.mockResolvedValue([ref('b')]);
    refs.readRef.mockResolvedValue('b-new');
    const journal = new ObservationJournal(new Map());
    const basis = await captureObservedWriteBasis({
      refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: null, ownCandidate: 1, context: VersionVector.empty(),
    });
    expect(basis.observation.heads).toEqual([]);
    expect(journal.scans).toEqual([]);
  });

  it('keeps foreign publication after capture outside its direct observations', async () => {
    const refs = createPatchBuilderMockPersistence();
    refs.listRefs.mockResolvedValue([ref('a')]);
    refs.readRef.mockResolvedValue(A);
    const journal = new ObservationJournal(new Map([[A, frame('a', A, 21, 7)]]), () => {
      refs.readRef.mockResolvedValue('a-next');
      refs.listRefs.mockResolvedValue([ref('a'), ref('c')]);
    });
    const basis = await captureObservedWriteBasis({
      refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: null, ownCandidate: 1, context: VersionVector.empty(),
    });
    expect(basis.observation.frontier()).toEqual(new Map([['a', A]]));
    expect(basis.lamport).toBe(22);
    expect(journal.scans).toHaveLength(1);
  });

  it('ignores disappeared foreign refs and retains the supplied process clock', async () => {
    const refs = createPatchBuilderMockPersistence();
    refs.listRefs.mockResolvedValue([ref('a')]);
    const journal = new ObservationJournal(new Map());
    const basis = await captureObservedWriteBasis({
      refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: null, ownCandidate: 50, context: VersionVector.empty(),
    });
    expect(basis.lamport).toBe(50);
    expect(basis.observation.heads).toEqual([]);
  });

  it('refuses unrelated enumeration and mismatched retained identities', async () => {
    const refs = createPatchBuilderMockPersistence();
    const journal = new ObservationJournal(new Map([[A, frame('other', A, 21, 7)]]));
    const request = { refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: null,
      ownCandidate: 1, context: VersionVector.empty() };
    refs.listRefs.mockResolvedValue(['refs/warp/other/writers/a']);
    await expect(captureObservedWriteBasis(request)).rejects.toBeInstanceOf(InvalidWriteObservationError);
    refs.listRefs.mockResolvedValue([ref('a')]);
    refs.readRef.mockResolvedValue(A);
    await expect(captureObservedWriteBasis(request)).rejects.toBeInstanceOf(InvalidWriteObservationError);
    expect(journal.closed).toBe(1);
  });

  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER])('refuses a head clock that cannot advance: %s', clock => {
    expect(() => new ObservedWriterHead('a', A, clock)).toThrow(InvalidWriteObservationError);
  });

  it('rejects duplicate or unconstructed frontier entries and preserves caller arrays', () => {
    const head = new ObservedWriterHead('a', A, 1);
    expect(() => new ObservedWriteFrontier('L', [head, head])).toThrow(InvalidWriteObservationError);
    expect(() => new ObservedWriteFrontier('L', [{ writerId: 'a', patchSha: A, lamport: 1 }]))
      .toThrow(InvalidWriteObservationError);
    expect(() => new ObservedWriterHead('', A, 1)).toThrow(InvalidWriteObservationError);
    expect(() => new ObservedWriterHead('a', '', 1)).toThrow(InvalidWriteObservationError);
    expect(() => new ObservedWriteFrontier('', [])).toThrow(InvalidWriteObservationError);
    const heads = [head];
    const frontier = new ObservedWriteFrontier('L', heads);
    heads.length = 0;
    expect(frontier.heads).toEqual([head]);
    expect(Object.isFrozen(frontier.heads)).toBe(true);
    expect(Object.isFrozen(head)).toBe(true);
  });

  it.each([NaN, Infinity, 0, -1, Number.MAX_SAFE_INTEGER + 1])('refuses an invalid own candidate: %s', clock => {
    expect(() => new ObservedWriteBasis(new ObservedWriteFrontier('L', []), VersionVector.empty(), clock))
      .toThrow(InvalidWriteObservationError);
  });
});

it('refuses an unavailable captured patch and closes the iterator', async () => {
  const refs = createPatchBuilderMockPersistence();
  refs.listRefs.mockResolvedValue([ref('a')]);
  refs.readRef.mockResolvedValue(A);
  const journal = new ObservationJournal(new Map());
  await expect(captureObservedWriteBasis({
    refs, journal, graphName: 'L', writerId: 'b', expectedParentSha: null,
    ownCandidate: 1, context: VersionVector.empty(),
  })).rejects.toBeInstanceOf(InvalidWriteObservationError);
  expect(journal.closed).toBe(1);
});
