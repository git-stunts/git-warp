import { expect, it, vi } from 'vitest';
import ContentReadProjection, { MAX_CONTENT_READ_OPERATIONS, MAX_CONTENT_READ_PATCHES, MAX_CONTENT_READ_TEXT_UNITS, MAX_CONTENT_READ_MEMBERS } from '../../../../src/domain/services/ContentReadProjection.ts';
import ContentReadBasis, { MAX_CONTENT_READ_WRITERS } from '../../../../src/domain/services/ContentReadBasis.ts';
import ContentOwner from '../../../../src/domain/api/ContentOwner.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../../src/domain/types/ops/EdgeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import NodePropSet from '../../../../src/domain/types/ops/NodePropSet.ts';
import EdgePropSet from '../../../../src/domain/types/ops/EdgePropSet.ts';
import BlobValue from '../../../../src/domain/types/ops/BlobValue.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import type { PatchOp } from '../../../../src/domain/types/ops/unions.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import { encodeLegacyEdgePropNode } from '../../../../src/domain/services/KeyCodec.ts';
import { createPatchBuilderMockPersistence, RecordingPatchJournal } from './PatchBuilderTestHarness.ts';

const EDGE = { from: 'n', to: 'm', label: 'e' };
const OWNER = new ContentOwner({ kind: 'node', subject: 'n' });
const HEAD = 'a003';
function entry(ops: readonly PatchOp[], sha = HEAD, lamport = 3, writer = 'alice') {
  return new PatchEntry({ sha, patch: new Patch({ schema: 2, writer, lamport, context: {}, ops }) });
}
function fixture(entries: readonly PatchEntry[]) {
  const refs = createPatchBuilderMockPersistence();
  refs.listRefs.mockResolvedValue(['refs/warp/documents/writers/alice']);
  refs.readRef.mockResolvedValue(HEAD);
  const journal = new RecordingPatchJournal(refs);
  vi.spyOn(journal, 'scanPatchHistory').mockImplementation(() => WarpStream.from(entries));
  return { refs, journal, basis: new ContentReadBasis(new Map([['alice', HEAD]])) };
}
async function read(entries: readonly PatchEntry[], owner = OWNER) {
  const { journal, basis } = fixture(entries);
  return await new ContentReadProjection(owner).read(journal, basis);
}

it('uses the winning content lineage and original operation indices, ignoring unrelated registers', async () => {
  const record = await read([
    entry([new PropSet('n', '_content.mime', 'wrong/later')]),
    entry([
      new NodeAdd('n', new Dot('alice', 1)), new NodeAdd('outside', new Dot('alice', 2)),
      new PropSet('outside', '_content', 'unrelated'), new PropSet('n', 'ordinary', 'ignored'),
      new NodePropSet('n', '_content', 'old'), new NodePropSet('n', '_content', 'winner'),
      new NodePropSet('n', '_content.size', 7), new NodePropSet('n', '_content.mime', 'text/plain'),
      new BlobValue('n', 'asset'),
    ], 'a002', 2),
  ]);
  expect(record?.payload.handle.toString()).toBe('winner');
  expect(record?.payload.size?.toNumber()).toBe(7);
  expect(record?.payload.mime).toBeNull();
});

it('handles wire and canonical edge content, endpoint identity, and remove/re-add lifecycle', async () => {
  const owner = new ContentOwner({ kind: 'edge', ...EDGE });
  const original = entry([
    new NodeAdd('n', new Dot('alice', 1)), new NodeAdd('m', new Dot('alice', 2)),
    new NodeAdd('outside', new Dot('alice', 3)), new EdgeAdd({ ...EDGE, dot: new Dot('alice', 4) }),
    new EdgeAdd({ ...EDGE, label: 'other', dot: new Dot('alice', 5) }),
    new PropSet(encodeLegacyEdgePropNode('n', 'm', 'e'), '_content', 'edge'),
    new EdgePropSet({ ...EDGE, key: '_content.mime', value: 'text/plain' }),
    new EdgePropSet({ ...EDGE, key: 'ordinary', value: 'ignored' }),
    new EdgePropSet({ ...EDGE, label: 'other', key: '_content', value: 'ignored' }),
  ], 'a001', 1);
  const found = await read([entry([]), original], owner);
  expect(found?.payload.handle.toString()).toBe('edge');
  expect(found?.payload.mime?.toString()).toBe('text/plain');
  expect(await read([entry([
    new EdgeRemove({ ...EDGE, observedDots: ['alice:4'] }),
    new EdgeAdd({ ...EDGE, dot: new Dot('alice', 6) }),
  ]), original], owner)).toBeNull();
  expect(await read([entry([new NodeRemove('n', ['alice:1'])]), original], owner)).toBeNull();
  expect(await read([entry([new EdgePropSet({ ...EDGE, key: '_content', value: 'ignored' })])])).toBeNull();
});

it('refuses missing or mismatched history rather than reporting content absence', async () => {
  for (const entries of [[], [entry([], 'a002')], [entry([], HEAD, 3, 'bob')]]) {
    await expect(read(entries)).rejects.toMatchObject({ code: 'E_CONTENT_READ_HISTORY' });
  }
});

it('captures sorted immutable heads with bounded ref enumeration', async () => {
  const { refs } = fixture([]);
  refs.listRefs.mockResolvedValue(['refs/warp/documents/writers/z', 'irrelevant', 'refs/warp/documents/writers/a']);
  refs.readRef.mockResolvedValueOnce(HEAD).mockResolvedValueOnce(HEAD).mockResolvedValueOnce(null);
  const basis = await ContentReadBasis.capture(refs, 'documents');
  expect(basis.entries).toEqual([['a', HEAD]]);
  expect(Object.isFrozen(basis.entries)).toBe(true);
  expect(refs.listRefs).toHaveBeenCalledWith('refs/warp/documents/writers/', { limit: MAX_CONTENT_READ_WRITERS + 1 });
  const sorted = new ContentReadBasis(new Map([['z', HEAD], ['a', HEAD]]));
  expect(sorted.entries.map(([writer]) => writer)).toEqual(['a', 'z']);
});

it('rejects excessive writers, operations, patches, membership, and retained text', async () => {
  const frontier = new Map(Array.from({ length: MAX_CONTENT_READ_WRITERS + 1 }, (_, i) => [`w${i}`, HEAD]));
  expect(() => new ContentReadBasis(frontier)).toThrow(expect.objectContaining({ code: 'E_CONTENT_READ_LIMIT' }));
  const { refs } = fixture([]);
  refs.listRefs.mockResolvedValue(Array.from(frontier.keys()));
  await expect(ContentReadBasis.capture(refs, 'documents')).rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
  await expect(read([entry(Array.from({ length: MAX_CONTENT_READ_OPERATIONS + 1 }, () => new BlobValue('n', 'asset')))]))
    .rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
  await expect(read(Array.from({ length: MAX_CONTENT_READ_PATCHES + 1 }, () => entry([]))))
    .rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
  await expect(read([entry([new PropSet('n', '_content', 'x'.repeat(MAX_CONTENT_READ_TEXT_UNITS + 1))])]))
    .rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
  await expect(read([entry([new NodeRemove('n', Array.from({ length: MAX_CONTENT_READ_MEMBERS + 1 }, () => 'alice:1'))])]))
    .rejects.toMatchObject({ code: 'E_CONTENT_READ_LIMIT' });
});
