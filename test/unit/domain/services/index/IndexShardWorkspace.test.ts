import { describe, expect, it } from 'vitest';
import { EdgeShard } from '../../../../../src/domain/artifacts/EdgeShard.ts';
import { LabelShard } from '../../../../../src/domain/artifacts/LabelShard.ts';
import { MetaShard } from '../../../../../src/domain/artifacts/MetaShard.ts';
import IndexError from '../../../../../src/domain/errors/IndexError.ts';
import IndexShardWorkspace from '../../../../../src/domain/services/index/IndexShardWorkspace.ts';
import { getRoaringBitmap32 } from '../../../../../src/domain/utils/roaring.ts';
import CborIndexShardTree from '../../../../../src/infrastructure/adapters/CborIndexShardTree.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';

function workspaceOver(shards: ConstructorParameters<typeof MetaShard>[0] | null, labels: Array<[string, number]> | null) {
  const empty = new CborIndexShardTree({ codec: defaultCodec, tree: {} });
  const seeded = [
    ...(shards === null ? [] : [new MetaShard(shards)]),
    ...(labels === null ? [] : [new LabelShard({ labels })]),
  ];
  return new IndexShardWorkspace(new CborIndexShardTree({ codec: defaultCodec, tree: empty.withShards(seeded) }));
}

describe('IndexShardWorkspace', () => {
  it('inflates a stored meta shard once and deflates it unchanged', () => {
    const alive = new (getRoaringBitmap32())([7]).serialize(true);
    const workspace = workspaceOver({ shardKey: 'aa', nodeToGlobal: [['A', 7]], nextLocalId: 1, alive }, null);

    const meta = workspace.meta('aa');

    expect(workspace.meta('aa')).toBe(meta);
    expect(meta.nodeToGlobalMap.get('A')).toBe(7);
    expect(meta.globalToNode.get(7)).toBe('A');
    expect(meta.aliveBitmap.has(7)).toBe(true);
    expect(workspace.flush()).toEqual([
      new MetaShard({ shardKey: 'aa', nodeToGlobal: [['A', 7]], nextLocalId: 1, alive }),
    ]);
  });

  it('starts an empty alive bitmap for a stored meta shard without alive bits', () => {
    const workspace = workspaceOver({ shardKey: 'aa', nodeToGlobal: [['A', 7]], nextLocalId: 1, alive: new Uint8Array(0) }, null);

    expect(workspace.meta('aa').aliveBitmap.size).toBe(0);
    expect(workspace.meta('aa').nodeToGlobalMap.get('A')).toBe(7);
  });

  it('starts an absent meta shard empty', () => {
    const meta = workspaceOver(null, null).meta('bb');

    expect(meta.nodeToGlobal).toEqual([]);
    expect(meta.nextLocalId).toBe(0);
    expect(meta.aliveBitmap.size).toBe(0);
  });

  it('emits the label registry only after a new label', () => {
    const workspace = workspaceOver(null, [['knows', 4], ['owns', 2]]);

    workspace.ensureLabel('knows');
    expect(workspace.flush()).toEqual([]);

    workspace.ensureLabel('manages');
    workspace.ensureLabel('likes');
    expect(workspace.flush()).toEqual([
      new LabelShard({ labels: [['knows', 4], ['likes', 6], ['manages', 5], ['owns', 2]] }),
    ]);
  });

  it('starts label IDs at zero and keeps a __proto__ label as data', () => {
    const workspace = workspaceOver(null, null);

    workspace.ensureLabel('__proto__');

    expect(workspace.flush()).toEqual([new LabelShard({ labels: [['__proto__', 0]] })]);
  });

  it('caches edge shards per direction and deflates them as edge shards', () => {
    const workspace = workspaceOver(null, null);
    const ctx = workspace.edgeContext();

    const fwd = ctx.getOrLoadEdgeShard(ctx.fwdCache, 'fwd', 'aa');
    fwd['all'] = { '1': new Uint8Array([1]) };
    ctx.getOrLoadEdgeShard(ctx.revCache, 'rev', 'bb');

    expect(ctx.getOrLoadEdgeShard(ctx.fwdCache, 'fwd', 'aa')).toBe(fwd);
    expect(workspace.flush()).toEqual([
      new EdgeShard({ shardKey: 'aa', direction: 'fwd', buckets: { all: { '1': new Uint8Array([1]) } } }),
      new EdgeShard({ shardKey: 'bb', direction: 'rev', buckets: {} }),
    ]);
  });

  it('refuses an unknown edge direction', () => {
    const ctx = workspaceOver(null, null).edgeContext();

    expect(() => ctx.getOrLoadEdgeShard(ctx.fwdCache, 'sideways', 'aa')).toThrow(IndexError);
  });
});
