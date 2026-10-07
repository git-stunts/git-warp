import { describe, expect, it } from 'vitest';
import ObservedWriterHead from '../../../../src/domain/types/ObservedWriterHead.ts';
import ObservedWriteFrontier from '../../../../src/domain/types/ObservedWriteFrontier.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import InvalidWriteObservationError from '../../../../src/domain/errors/InvalidWriteObservationError.ts';
import { hydrateDecodedPatch } from '../../../../src/domain/services/PatchHydrator.ts';
import { hydratePatchAtDecodeBoundary } from '../../../../src/infrastructure/adapters/PatchHydrationAdapter.ts';
import decodeObservedWriteFrontier from '../../../../src/infrastructure/adapters/ObservedWriteFrontierDecoder.ts';
import { encode, decode } from '../../../../src/infrastructure/codecs/CborCodec.ts';

const payload = {
  schema: 2, writer: 'b', lamport: 22, context: { a: 7 }, ops: [],
  observedFrontier: { graphName: 'L', heads: [{ writerId: 'a', patchSha: 'a-tip', lamport: 21 }] },
};
describe('observed-frontier persistence boundary', () => {
  it('round trips actual patch CBOR into protected runtime heads', () => {
    const patch = new Patch({
      writer: 'b', lamport: 22, context: { a: 7 }, ops: [],
      observedFrontier: new ObservedWriteFrontier('L', [new ObservedWriterHead('a', 'a-tip', 21)]),
    });
    const restored = hydratePatchAtDecodeBoundary(decode(encode(patch)));
    expect(restored.observedFrontier).toBeInstanceOf(ObservedWriteFrontier);
    expect(restored.observedFrontier?.heads[0]).toBeInstanceOf(ObservedWriterHead);
    expect(restored.observedFrontier?.frontier()).toEqual(new Map([['a', 'a-tip']]));
    expect(Object.isFrozen(restored.observedFrontier)).toBe(true);
    expect(restored.context).toEqual({ a: 7 });
  });

  it('retains legacy bytes and legacy-reader operation interpretation', () => {
    const legacySchema: 2 = 2;
    const legacy = { schema: legacySchema, writer: 'b', lamport: 22, context: { a: 7 }, ops: [],
      reads: undefined, writes: undefined, entityAdmissions: undefined };
    const restored = hydratePatchAtDecodeBoundary(decode(encode(legacy)));
    expect(restored.observedFrontier).toBeUndefined();
    expect(Object.hasOwn(restored, 'observedFrontier')).toBe(false);
    expect(encode(restored)).toEqual(encode(legacy));
    const oldReader = hydrateDecodedPatch(payload, undefined);
    expect(oldReader.observedFrontier).toBeUndefined();
    expect(oldReader.context).toEqual(restored.context);
    expect(oldReader.lamport).toBe(restored.lamport);
    expect(oldReader.ops).toEqual(restored.ops);
  });

  it.each([
    null, 1, [], { graphName: 'L', heads: null },
    { graphName: 1, heads: [] }, { graphName: 'L', heads: [null] },
    { graphName: 'L', heads: [{ writerId: 1, patchSha: 'tip', lamport: 1 }] },
    { graphName: 'L', heads: [{ writerId: 'a', patchSha: '', lamport: 1 }] },
    { graphName: 'L', heads: [{ writerId: 'a', patchSha: 'tip', lamport: '1' }] },
    { graphName: 'L', heads: [{ writerId: 'a', patchSha: 'tip', lamport: Number.MAX_SAFE_INTEGER }] },
  ])('rejects malformed optional frontier metadata: %s', observedFrontier => {
    expect(() => decodeObservedWriteFrontier({ observedFrontier })).toThrow(InvalidWriteObservationError);
  });

  it('refuses an observation claim at or beyond the published clock', () => {
    expect(() => hydratePatchAtDecodeBoundary({ ...payload, lamport: 21 }))
      .toThrowError(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
    expect(() => hydratePatchAtDecodeBoundary({ ...payload, lamport: 20 }))
      .toThrowError(expect.objectContaining({ code: 'E_PATCH_NO_STATE' }));
  });

  it('rejects a non-object root before consulting optional metadata', () => {
    expect(() => decodeObservedWriteFrontier(null)).toThrow(InvalidWriteObservationError);
  });
});
