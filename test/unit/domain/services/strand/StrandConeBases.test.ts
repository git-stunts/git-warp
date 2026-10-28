import { describe, expect, it } from 'vitest';
import RuntimeHost from '../../../../../src/domain/RuntimeHost.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeBasisHead from '../../../../../src/domain/services/cone/ConeBasisHead.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import StrandConeBases from '../../../../../src/domain/services/strand/StrandConeBases.ts';
import StrandConeTips from '../../../../../src/domain/services/strand/StrandConeTips.ts';
import MintId from '../../../../../src/domain/crdt/MintId.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../../helpers/MemoryRuntimeHost.ts';
import MemoryRuntimeStorageAdapter from '../../../../helpers/MemoryRuntimeStorageAdapter.ts';

const LANE = 'events';

function requireBasis(value: ConeBasis | object): ConeBasis {
  if (!(value instanceof ConeBasis)) { throw new Error('expected a cone basis'); }
  return value;
}

async function host() {
  const history = new InMemoryGraphAdapter();
  const runtimeStorage = new MemoryRuntimeStorageAdapter({ history });
  const graph = await openMemoryRuntimeHostProduct({ persistence: history, runtimeStorage, graphName: LANE, writerId: 'alice' });
  if (!(graph instanceof RuntimeHost) || graph._coneRecords === null || graph._conePatches === null) {
    throw new Error('memory storage keeps cone records');
  }
  const lane = ConeLaneBasis.ofLane({ store: graph._coneRecords, feed: graph._conePatches, lane: LANE });
  return { history, runtimeStorage, graph, lane };
}

/** A strand forked at the lane's current cone basis, as Runtime.fork does. */
async function forked(fixture: Awaited<ReturnType<typeof host>>, name: string) {
  const basis = requireBasis(await fixture.lane.advance());
  return await fixture.graph.createStrand({ strandId: name, owner: 'alice', baseFrontier: new Map(basis.writerHeads()), baseBasis: basis });
}

describe('strand cone bases (#1039)', () => {
  it('pins the fork basis, opens base and strand bases, and releases both on drop', async () => {
    const fixture = await host();
    await fixture.graph.patch((patch) => { patch.addNode('doc'); });
    const descriptor = await forked(fixture, 'draft');
    expect(descriptor.baseObservation.checkpointSha).toBeNull();
    const opened = await fixture.graph.openStrandCone('draft');
    expect(opened.strandId).toBe(descriptor.strandId);
    const base = requireBasis(await opened.base.advance());
    expect(base.equals(requireBasis(await fixture.lane.advance()))).toBe(true);
    await fixture.graph.patchStrandOnConeWithEvidence(descriptor.strandId, (patch) => { patch.setProperty('doc', 'k', 1); });
    const overlay = MintId.strand('alice', descriptor.strandId).encode();
    const strand = requireBasis(await opened.strand.advance());
    expect([...strand.writerHeads().keys()]).toEqual([overlay, 'alice']);
    expect((await opened.strand.reader.node(strand.root, 'doc')).props.get('k')?.value).toBe(1);
    const strandHead = ConeBasisHead.forStrand(LANE, descriptor.strandId);
    expect(await fixture.runtimeStorage.coneRecords.readBasis(strandHead)).not.toBeNull();
    await fixture.graph.dropStrand(descriptor.strandId);
    expect(await fixture.runtimeStorage.coneRecords.readBasis(strandHead)).toBeNull();
    expect(await fixture.runtimeStorage.coneRecords.readBasis(ConeBasisHead.forStrandBase(LANE, descriptor.strandId))).toBeNull();
  });

  it('folds braided read overlays into the strand tips without walking any chain', async () => {
    const fixture = await host();
    await fixture.graph.patch((patch) => { patch.addNode('doc'); });
    const support = await forked(fixture, 'support');
    const target = await forked(fixture, 'target');
    await fixture.graph.patchStrandOnConeWithEvidence(support.strandId, (patch) => { patch.setProperty('doc', 'from', 'support'); });
    await fixture.graph.braidStrand(target.strandId, { braidedStrandIds: [support.strandId] });
    const descriptors = fixture.graph._strandController._strandService._descriptorStore;
    const tips = await new StrandConeTips(descriptors, target.strandId).tips();
    expect(tips.get(MintId.strand('alice', support.strandId).encode())).toMatch(/^[0-9a-f]{40}$/u);
    const opened = await fixture.graph.openStrandCone(target.strandId);
    const strand = requireBasis(await opened.strand.advance());
    expect((await opened.strand.reader.node(strand.root, 'doc')).props.get('from')?.value).toBe('support');
    await expect(new StrandConeTips(descriptors, 'f'.repeat(64)).tips()).rejects.toMatchObject({ code: 'E_STRAND_NOT_FOUND' });
  });

  it('refuses unknown strands, Lamport ceilings, read-only overlays and missing journals', async () => {
    const fixture = await host();
    await expect(fixture.graph.openStrandCone('missing')).rejects.toMatchObject({ code: 'E_STRAND_NOT_FOUND' });
    const ceiled = await fixture.graph.createStrand({ strandId: 'ceiled', lamportCeiling: 3 });
    await expect(fixture.graph.openStrandCone(ceiled.strandId)).rejects.toMatchObject({ code: 'E_STRAND_CONE_CEILING' });
    const cones = new StrandConeBases({ runtime: fixture.graph, descriptors: fixture.graph._strandController._strandService._descriptorStore });
    await expect(cones.open('e'.repeat(64))).rejects.toMatchObject({ code: 'E_STRAND_NOT_FOUND' });
    await expect(fixture.graph.patchStrandOnConeWithEvidence('e'.repeat(64), () => undefined))
      .rejects.toMatchObject({ code: 'E_STRAND_NOT_FOUND' });
    const readOnly = await forked(fixture, 'read-only');
    await fixture.graph.braidStrand(readOnly.strandId, { writable: false });
    await expect(fixture.graph.patchStrandOnConeWithEvidence(readOnly.strandId, () => undefined))
      .rejects.toMatchObject({ code: 'E_STRAND_INVALID_ARGS' });
    const writable = await forked(fixture, 'writable');
    const journal = fixture.graph._patchJournal;
    try {
      // @ts-expect-error Deliberate capability loss: a strand write needs the patch journal.
      fixture.graph._patchJournal = null;
      await expect(fixture.graph.patchStrandOnConeWithEvidence(writable.strandId, () => undefined))
        .rejects.toMatchObject({ code: 'E_MISSING_JOURNAL' });
    } finally {
      fixture.graph._patchJournal = journal;
    }
  });

  it('refuses cone bases over storage without cone records and drops such strands cleanly', async () => {
    const fixture = await host();
    const descriptor = await fixture.graph.createStrand({ strandId: 'plain' });
    const records = fixture.graph._coneRecords;
    try {
      fixture.graph._coneRecords = null;
      await expect(fixture.graph.openStrandCone(descriptor.strandId)).rejects.toMatchObject({ code: 'E_STRAND_CONE_UNAVAILABLE' });
      await expect(fixture.graph.dropStrand(descriptor.strandId)).resolves.toBe(true);
    } finally {
      fixture.graph._coneRecords = records;
    }
  });
});
