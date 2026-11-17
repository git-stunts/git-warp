import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../../src/domain/artifacts/MetaShard.ts';
import { PropertyShard } from '../../../../src/domain/artifacts/PropertyShard.ts';
import IndexError from '../../../../src/domain/errors/IndexError.ts';
import computeShardKey from '../../../../src/domain/utils/shardKey.ts';
import CborIndexShardTree from '../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import defaultCodec from '../../../../src/infrastructure/codecs/CborCodec.ts';
import { CborIndexStoreAdapter } from '../../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

function treeOf(entries: Record<string, unknown>): Record<string, Uint8Array> {
  return Object.fromEntries(Object.entries(entries).map(([path, value]) => [path, defaultCodec.encode(value)]));
}

function open(entries: Record<string, unknown>): CborIndexShardTree {
  return new CborIndexShardTree({ codec: defaultCodec, tree: treeOf(entries) });
}

function malformed(read: () => unknown, reason: string): void {
  expect(read).toThrow(IndexError);
  expect(read).toThrow(expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED', context: expect.objectContaining({ reason }) }));
}

describe('CborIndexShardTree', () => {
  it('returns null for every absent shard', () => {
    const tree = open({});

    expect(tree.readMeta('aa')).toBeNull();
    expect(tree.readEdges('fwd', 'aa')).toBeNull();
    expect(tree.readLabels()).toBeNull();
    expect(tree.readProperties('aa')).toBeNull();
  });

  it('reads meta shards in the list form and the legacy map form', () => {
    const alive = new Uint8Array([1, 2, 3]);
    const current = open({ 'meta_aa.cbor': { nodeToGlobal: [['A', 7]], nextLocalId: 1, alive } }).readMeta('aa');
    const legacy = open({ 'meta_bb.cbor': { nodeToGlobal: { B: 9 }, nextLocalId: 2 } }).readMeta('bb');

    expect(current).toBeInstanceOf(MetaShard);
    expect(current).toMatchObject({ shardKey: 'aa', nodeToGlobal: [['A', 7]], nextLocalId: 1, alive });
    expect(legacy).toMatchObject({ shardKey: 'bb', nodeToGlobal: [['B', 9]], nextLocalId: 2, alive: new Uint8Array(0) });
    expect(open({ 'meta_cc.cbor': { nodeToGlobal: [], nextLocalId: 0, alive: null } }).readMeta('cc')?.alive)
      .toEqual(new Uint8Array(0));
  });

  it('refuses malformed meta shards', () => {
    malformed(() => open({ 'meta_aa.cbor': [] }).readMeta('aa'), 'meta shard is not a map');
    malformed(() => open({ 'meta_aa.cbor': new Uint8Array([1]) }).readMeta('aa'), 'meta shard is not a map');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: 'x', nextLocalId: 0 } }).readMeta('aa'),
      'id table is neither a list nor a map');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: [['A']], nextLocalId: 0 } }).readMeta('aa'),
      'id entry is not a [name, id] pair');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: [[1, 2]], nextLocalId: 0 } }).readMeta('aa'),
      'id entry is not a [name, id] pair');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: [], nextLocalId: -1 } }).readMeta('aa'),
      'id is not a non-negative integer');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: { A: 1.5 }, nextLocalId: 0 } }).readMeta('aa'),
      'id is not a non-negative integer');
    malformed(() => open({ 'meta_aa.cbor': { nodeToGlobal: [], nextLocalId: 0, alive: [1] } }).readMeta('aa'),
      'alive bitmap is not a byte string');
  });

  it('reads edge shards into fresh bucket maps', () => {
    const bitmap = new Uint8Array([4]);
    const shard = open({ 'rev_aa.cbor': { all: { '3': bitmap }, '0': { '3': bitmap } } }).readEdges('rev', 'aa');

    expect(shard).toBeInstanceOf(EdgeShard);
    expect(shard).toMatchObject({ shardKey: 'aa', direction: 'rev', buckets: { all: { '3': bitmap }, '0': { '3': bitmap } } });
  });

  it('refuses malformed edge shards', () => {
    malformed(() => open({ 'fwd_aa.cbor': [] }).readEdges('fwd', 'aa'), 'edge shard is not a map');
    malformed(() => open({ 'fwd_aa.cbor': { all: [] } }).readEdges('fwd', 'aa'), 'edge bucket is not a map');
    malformed(() => open({ 'fwd_aa.cbor': { other: {} } }).readEdges('fwd', 'aa'), 'edge shard key is not an index id');
    malformed(() => open({ 'fwd_aa.cbor': { all: { x: new Uint8Array() } } }).readEdges('fwd', 'aa'),
      'edge shard key is not an index id');
    malformed(() => open({ 'fwd_aa.cbor': { all: { '1': 'bits' } } }).readEdges('fwd', 'aa'),
      'edge bitmap is not a byte string');
  });

  it('reads labels in the list form and the legacy map form', () => {
    expect(open({ 'labels.cbor': [['knows', 0]] }).readLabels()).toMatchObject({ labels: [['knows', 0]] });
    expect(open({ 'labels.cbor': { owns: 1 } }).readLabels()).toBeInstanceOf(LabelShard);
    expect(open({ 'labels.cbor': { owns: 1 } }).readLabels()?.labels).toEqual([['owns', 1]]);
    malformed(() => open({ 'labels.cbor': [['knows', 'zero']] }).readLabels(), 'id is not a non-negative integer');
  });

  it('reads validated property bags routed to their shard', () => {
    const shardKey = computeShardKey('A');
    const entries = open({ [`props_${shardKey}.cbor`]: [['A', { name: 'Alice' }]] }).readProperties(shardKey);

    expect(entries === null ? null : Object.fromEntries(entries)).toEqual({ A: { name: 'Alice' } });
    expect(() => open({ 'props_00.cbor': [['A', { name: 'Alice' }]] }).readProperties('00')).toThrow(IndexError);
  });

  it('encodes shards over a copy of the tree and keeps untouched entries', () => {
    const base = treeOf({ 'labels.cbor': [['knows', 0]], 'meta_aa.cbor': { nodeToGlobal: [], nextLocalId: 0 } });
    const tree = new CborIndexShardTree({ codec: defaultCodec, tree: base });
    const meta = new MetaShard({ shardKey: 'aa', nodeToGlobal: [['A', 1]], nextLocalId: 1, alive: new Uint8Array([5]) });
    const props = new PropertyShard({ shardKey: 'bb', entries: [['B', { k: 'v' }]] });

    const next = tree.withShards([meta, props]);

    expect(next['labels.cbor']).toBe(base['labels.cbor']);
    expect(defaultCodec.decode(next['meta_aa.cbor'] ?? new Uint8Array())).toEqual({
      nodeToGlobal: [['A', 1]], nextLocalId: 1, alive: new Uint8Array([5]),
    });
    expect(defaultCodec.decode(next['props_bb.cbor'] ?? new Uint8Array())).toEqual([['B', { k: 'v' }]]);
    expect(Object.keys(base).sort()).toEqual(['labels.cbor', 'meta_aa.cbor']);
    expect(tree.withShards([])).toEqual(base);
  });

  it('is the tree view that CborIndexStoreAdapter opens with its codec', () => {
    const cas = new InMemoryGitCasFacade({ history: new InMemoryGraphAdapter(), storage: new InMemoryBlobStorageAdapter() });
    const indexes = new CborIndexStoreAdapter({ codec: defaultCodec, assetStorage: new GitCasAssetStorageAdapter({ cas }), cas });

    const tree = indexes.openShardTree(treeOf({ 'labels.cbor': [['knows', 0]] }));

    expect(tree).toBeInstanceOf(CborIndexShardTree);
    expect(tree.readLabels()?.labels).toEqual([['knows', 0]]);
  });
});
