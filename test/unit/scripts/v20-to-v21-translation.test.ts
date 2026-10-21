import { describe, expect, it } from 'vitest';

import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { allocateEntitySubject } from '../../../src/domain/services/PatchBuilderEntity.ts';
import EntityAdmissionBoundary from '../../../src/domain/types/EntityAdmissionBoundary.ts';
import EntityAdmissionOrigin from '../../../src/domain/types/EntityAdmissionOrigin.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import V21LegacyGraph from '../../../scripts/v20-to-v21/V21LegacyGraph.ts';
import type { V21LegacyStrand } from '../../../scripts/v20-to-v21/V21LegacyStrand.ts';
import V21PatchTranslator, { V21TranslationBlocked } from '../../../scripts/v20-to-v21/V21PatchTranslator.ts';
import V21Provenance from '../../../scripts/v20-to-v21/V21Provenance.ts';
import V21StrandView, { type V21ViewPatch } from '../../../scripts/v20-to-v21/V21StrandView.ts';
import { buildV21StrandView } from '../../../scripts/v20-to-v21/V21StrandViews.ts';

const MINT = `@w.alice@s.${'a'.repeat(64)}`;

function patch(writer: string, context: Record<string, number>, ops: Patch['ops']): Patch {
  return new Patch({ writer, lamport: 1, context, ops });
}

function lane(sha: string, value: Patch): V21ViewPatch {
  return { sha, patch: value, origin: { kind: 'lane', writerId: value.writer } };
}

function strand(sha: string, value: Patch, name = 'next'): V21ViewPatch {
  return { sha, patch: value, origin: { kind: 'strand', name } };
}

describe('v20-to-v21 translation (#1015)', () => {
  // Synthetic: no released version can put one legacy dot on a lane object
  // and a strand object in one view (strand mints start above the observed
  // frontier, bases never move, braids need identical bases). The fan-out
  // rule must still hold if such history exists.
  it('SYNTHETIC cross-origin alias: a remove fans out to every identity its legacy dot denoted', () => {
    const remove = patch('next', { next: 1 }, [new NodeRemove('lane:1', ['next:1'])]);
    const view = new V21StrandView([
      lane('l1', patch('next', { next: 1 }, [new NodeAdd('lane:1', new Dot('next', 1))])),
      strand('s1', patch('next', { next: 1 }, [new NodeAdd('strand:1', new Dot('next', 1))])),
      strand('s2', remove),
    ]);
    const translated = new V21PatchTranslator(view, 'next', new Map([['next', MINT]])).patch(remove);

    expect(translated.writer).toBe(MINT);
    expect(translated.ops).toEqual([new NodeRemove('lane:1', [`${MINT}:1`, 'next:1'])]);
  });

  it('splits a context entry by origin when a lane writer and the strand share a key', () => {
    const view = new V21StrandView([
      lane('l1', patch('next', { next: 1 }, [new NodeAdd('lane:1', new Dot('next', 1))])),
      strand('s1', patch('next', { next: 3 }, [new NodeAdd('strand:3', new Dot('next', 3))])),
    ]);
    const translator = new V21PatchTranslator(view, 'next', new Map([['next', MINT]]));

    const { context } = translator.patch(patch('next', { next: 3, bob: 4 }, []));
    expect(new Map(VersionVector.from(context).entries())).toEqual(new Map([[MINT, 3], ['next', 1], ['bob', 4]]));
  });

  it('re-keys the strand\'s own adds and keeps a lane dot a lane dot', () => {
    const view = new V21StrandView([
      lane('l1', patch('next', { next: 1 }, [new NodeAdd('lane:1', new Dot('next', 1))])),
      strand('s1', patch('next', { next: 2 }, [new NodeAdd('strand:1', new Dot('next', 2))])),
    ]);
    const translator = new V21PatchTranslator(view, 'next', new Map([['next', MINT]]));

    expect(translator.patch(patch('next', { next: 2 }, [new NodeAdd('strand:1', new Dot('next', 2))])).ops)
      .toEqual([new NodeAdd('strand:1', new Dot(MINT, 2))]);
    expect(translator.dot('next:1')).toEqual(['next:1']);
  });

  it('blocks a strand that carries an add it did not mint, or reads an unconverted support', () => {
    const view = new V21StrandView([strand('s1', patch('next', {}, [new NodeAdd('x', new Dot('other', 1))]))]);
    const translator = new V21PatchTranslator(view, 'next', new Map([['next', MINT]]));
    expect(() => translator.patch(patch('next', {}, [new NodeAdd('x', new Dot('other', 1))]))).toThrow(V21TranslationBlocked);

    const braided = new V21StrandView([strand('t1', patch('support', {}, [new NodeAdd('s', new Dot('support', 1))]), 'support')]);
    expect(() => new V21PatchTranslator(braided, 'next', new Map([['next', MINT]])).dot('support:1')).toThrow(/not converted/);
  });

  it('blocks only the strand whose view cannot be read', async () => {
    const legacy = Object.assign(Object.create(V21LegacyGraph.prototype), {
      chain: async () => { throw new Error('missing object'); },
    });
    const unreadable: V21LegacyStrand = {
      name: 'lost', descriptorSha: 'd'.repeat(40), owner: 'alice', scope: null, createdAt: '1', updatedAt: '1', leaseExpiresAt: null,
      baseObservation: { coordinateVersion: 'v', frontier: { alice: 'e'.repeat(40) }, frontierDigest: 'f', lamportCeiling: null, checkpointSha: null },
      overlayKind: 'overlay', writable: true, readOverlays: [], nextIntentSeq: 1, intents: [], evolution: null,
    };

    await expect(buildV21StrandView(legacy, unreadable, {
      graph: 'g', marker: null, laneHeads: new Map(), strandDescriptors: new Map(), overlayHeads: new Map(), braidPins: new Map(),
    })).rejects.toThrow(/view of strand 'lost' cannot be read/);
  });
});

describe('v20-to-v21 allocation provenance (#1015)', () => {
  function allocating(writer: string, dot: Dot): Patch {
    const subject = allocateEntitySubject('doc', dot);
    return new Patch({
      writer, lamport: 1, context: {}, ops: [new NodeAdd(subject, dot), new NodePropSet(subject, 'title', 'x')],
      entityAdmissions: [new EntityAdmissionBoundary({
        operationCount: 2, operationIndex: 0, origin: EntityAdmissionOrigin.allocated('doc', dot),
      })],
    });
  }

  it('resolves by origin, flags ambiguity, and leaves the unknown unmapped, always keeping the original bytes', () => {
    const provenance = new V21Provenance();
    const laneOnly = allocating('next', new Dot('next', 2));
    const shared = allocating('next', new Dot('next', 5));
    const strandOnly = allocating('next', new Dot('next', 7));
    provenance.index({ kind: 'lane', writerId: 'next' }, laneOnly);
    provenance.index({ kind: 'lane', writerId: 'next' }, shared);
    provenance.index({ kind: 'strand', name: 'next' }, shared);
    provenance.index({ kind: 'strand', name: 'next' }, strandOnly);
    const mintOf = (name: string): string | null => (name === 'next' ? MINT : null);
    const at = { commit: 'c'.repeat(40), legacyCommit: 'c'.repeat(40) };

    expect(provenance.resolve(laneOnly, at, mintOf)).toEqual([expect.objectContaining({ status: 'resolved', identity: 'next:2', original: 'next:2' })]);
    expect(provenance.resolve(strandOnly, at, mintOf)).toEqual([expect.objectContaining({ status: 'resolved', identity: `${MINT}:7` })]);
    expect(provenance.resolve(shared, at, mintOf)).toEqual([expect.objectContaining({
      status: 'ambiguous', identity: null, original: 'next:5', candidates: [`${MINT}:5`, 'next:5'],
    })]);
    expect(provenance.resolve(allocating('next', new Dot('next', 9)), at, mintOf))
      .toEqual([expect.objectContaining({ status: 'unmapped', identity: null, original: 'next:9' })]);
    expect(provenance.resolve(strandOnly, at, () => null)).toEqual([expect.objectContaining({ status: 'unmapped' })]);
  });
});
