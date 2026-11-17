/**
 * The node lifecycle shard family of a checkpoint index root: its bytes are
 * canonical, decoding and re-encoding reproduces them exactly, and the
 * decoder accepts nothing else.
 *
 * The pinned sha256 values were produced by running this file once against
 * the first implementation; they catch any later change to the encoding.
 * The receipt's value was pinned again the same way when the receipt gained
 * its floating tombstones. Every value was pinned again for schema 3 (#1119),
 * whose records carry the tombstoned dots that the node's entry holds: for
 * this fixture `readded` carries `w:1` and `w:2`, and the receipt lists no
 * dot, which the cases below assert.
 */

import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { IndexShard } from '../../../../src/domain/artifacts/IndexShard.ts';
import { NodeLifecycleReceipt } from '../../../../src/domain/artifacts/NodeLifecycleReceipt.ts';
import { NodeLifecycleShard } from '../../../../src/domain/artifacts/NodeLifecycleShard.ts';
import { Dot, encodeDot } from '../../../../src/domain/crdt/Dot.ts';
import { applyPatchOp, createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import NodeLifecycleIndexBuilder from '../../../../src/domain/services/index/NodeLifecycleIndexBuilder.ts';
import {
  decodeNodeLifecycleReceipt,
  decodeNodeLifecycleShard,
  NODE_LIFECYCLE_RECEIPT_PATH,
  nodeLifecycleShardPath,
} from '../../../../src/domain/services/index/NodeLifecycleShardReader.ts';
import type WarpState from '../../../../src/domain/services/state/WarpState.ts';
import WarpStream from '../../../../src/domain/stream/WarpStream.ts';
import type CodecValue from '../../../../src/domain/types/codec/CodecValue.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import NodeRemove from '../../../../src/domain/types/ops/NodeRemove.ts';
import PropSet from '../../../../src/domain/types/ops/PropSet.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { IndexShardEncodeTransform } from '../../../../src/infrastructure/adapters/IndexShardEncodeTransform.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';

const SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const event = (lamport: number, writer = 'w', opIndex = 0): EventId => new EventId(lamport, writer, SHA, opIndex);

/**
 * `readded`: added, written, removed and added again, with a later remove
 * pending. `early`: written before its first add. `plain`: added and written.
 */
function lifecycleState(): WarpState {
  const state = createEmptyState();
  applyPatchOp(state, new NodeAdd('readded', Dot.create('w', 1)), event(1));
  applyPatchOp(state, new PropSet('readded', 'old', 'o'), event(2));
  applyPatchOp(state, new NodeRemove('readded', [encodeDot(Dot.create('w', 1))]), event(3));
  applyPatchOp(state, new NodeAdd('readded', Dot.create('w', 2)), event(4));
  applyPatchOp(state, new PropSet('readded', 'new', 'n'), event(5));
  applyPatchOp(state, new NodeRemove('readded', [encodeDot(Dot.create('w', 2))]), event(6, 'x'));
  applyPatchOp(state, new PropSet('early', 'k', 'e'), event(7));
  applyPatchOp(state, new NodeAdd('early', Dot.create('w', 3)), event(8));
  applyPatchOp(state, new NodeAdd('plain', Dot.create('w', 4)), event(9));
  applyPatchOp(state, new PropSet('plain', 'b', 1), event(10, 'w', 0));
  applyPatchOp(state, new PropSet('plain', 'a', 2), event(10, 'w', 1));
  return state;
}

async function encode(shards: Iterable<IndexShard>): Promise<Map<string, Uint8Array>> {
  const encoded = new Map<string, Uint8Array>();
  for await (const [path, bytes] of WarpStream.from(shards).pipe(new IndexShardEncodeTransform(codec))) {
    encoded.set(path, bytes);
  }
  return encoded;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function refusal(payload: CodecValue, path: string): () => void {
  return () => decodeNodeLifecycleShard(codec.decode<CodecValue>(codec.encode(payload)), path);
}

describe('node lifecycle shards', () => {
  it('round-trips every shard byte for byte', async () => {
    const encoded = await encode(NodeLifecycleIndexBuilder.fromState(lifecycleState()).yieldShards());
    const shardPaths = [...encoded.keys()].filter((path) => path !== NODE_LIFECYCLE_RECEIPT_PATH);
    expect(encoded.has(NODE_LIFECYCLE_RECEIPT_PATH)).toBe(true);
    expect(shardPaths.length).toBeGreaterThan(0);

    for (const path of shardPaths) {
      const bytes = encoded.get(path) ?? new Uint8Array();
      const records = decodeNodeLifecycleShard(codec.decode<CodecValue>(bytes), path);
      const shardKey = path.slice('life_'.length, -'.cbor'.length);
      const again = await encode([new NodeLifecycleShard({ shardKey, records: [...records.values()] })]);

      expect(Array.from(again.get(path) ?? [])).toEqual(Array.from(bytes));
    }
    expect(Object.fromEntries([...encoded].map(([path, bytes]) => [path, sha256(bytes)]))).toEqual(PINNED_SHA256);
  });

  it('carries each node record as the state holds it', async () => {
    const state = lifecycleState();
    const encoded = await encode(NodeLifecycleIndexBuilder.fromState(state).yieldShards());
    const recordOf = (nodeId: string) => {
      const path = nodeLifecycleShardPath(nodeId);
      return decodeNodeLifecycleShard(codec.decode<CodecValue>(encoded.get(path) ?? new Uint8Array()), path).get(nodeId);
    };

    expect(recordOf('readded')).toMatchObject({
      birth: event(4), clear: event(6, 'x'), pendingRemoves: [],
      registers: new Map(), tombstonedDots: ['w:1', 'w:2'],
    });
    expect(recordOf('early')).toMatchObject({
      birth: event(8), clear: null, pendingRemoves: [], registers: new Map([['k', event(7)]]), tombstonedDots: [],
    });
    expect([...(recordOf('plain')?.registers.keys() ?? [])]).toEqual(['a', 'b']);
  });

  it('refuses a shard that is not in canonical form', () => {
    const path = nodeLifecycleShardPath('readded');
    const record = (nodeId: string, pending: CodecValue[]): CodecValue => [nodeId, [[4, 'w', SHA, 0], null, pending, []]];
    const malformed = expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' });

    expect(refusal({ schemaVersion: 0, entries: [] }, path)).toThrow(malformed);
    expect(refusal({ schemaVersion: 2, entries: [], extra: true }, path)).toThrow(malformed);
    expect(refusal({
      schemaVersion: 2,
      entries: [record('readded', [[7, 'w', SHA, 0], [6, 'w', SHA, 0]])],
    }, path)).toThrow(malformed);
    expect(refusal({ schemaVersion: 2, entries: [record('plain', [])] }, path)).toThrow(malformed);
    expect(refusal({
      schemaVersion: 2,
      entries: [['readded', [[4, 'w', SHA, 0], null, [], [['b', [1, 'w', SHA, 0]], ['a', [1, 'w', SHA, 0]]]]]],
    }, path)).toThrow(malformed);
    expect(refusal({ schemaVersion: 2, entries: [['readded', [[0, 'w', SHA, 0], null, [], []]]] }, path))
      .toThrow(malformed);
  });
});

const PINNED_SHA256: Readonly<Record<string, string>> = {
  'life_67.cbor': '4efada71d0124b4b61e495527978a2482d4a5c93a9f73fa797814b3ae4486045',
  'life_9c.cbor': 'c99110d66169080606908ef630b698145bd162f5d2286438e2b370a53027a131',
  'life_b2.cbor': '1729c7f86e23d344a4f582db20221d836065f458b1072ab55da2d775e842fd5d',
  'life_receipt.cbor': '2901d13558a22b7e34d12d92c1e2cc03235add132b56ac4a375b9e98c065cab6',
};

describe('node lifecycle receipt', () => {
  function receiptOf(encoded: ReadonlyMap<string, Uint8Array>): CodecValue {
    return codec.decode<CodecValue>(encoded.get(NODE_LIFECYCLE_RECEIPT_PATH) ?? new Uint8Array());
  }

  it('lists a tombstoned node dot whose add the state does not hold', async () => {
    // Writer x removed a dot of writer y that this state never received.
    const state = lifecycleState();
    applyPatchOp(state, new NodeRemove('plain', [encodeDot(Dot.create('y', 1))]), event(11, 'x'));
    const encoded = await encode(NodeLifecycleIndexBuilder.fromState(state).yieldShards());
    const paths = [...encoded.keys()];

    expect(decodeNodeLifecycleReceipt(receiptOf(encoded), paths)).toMatchObject({
      nodeCount: 3,
      shardCount: 3,
      floatingTombstones: ['y:1'],
    });
  });

  it('leaves out the tombstoned node dots that a node entry holds', async () => {
    // `readded` holds w:1 and w:2 and both are removed; its record lists them instead.
    const encoded = await encode(NodeLifecycleIndexBuilder.fromState(lifecycleState()).yieldShards());

    expect(decodeNodeLifecycleReceipt(receiptOf(encoded), [...encoded.keys()])).toMatchObject({
      floatingTombstones: [],
    });
  });

  it('refuses floating tombstones that are not ascending encoded dots', () => {
    const paths = ['life_67.cbor'];
    const receipt = (floatingTombstones: CodecValue): () => void => () => decodeNodeLifecycleReceipt(
      codec.decode<CodecValue>(codec.encode({ schemaVersion: 2, nodeCount: 1, shardCount: 1, floatingTombstones })),
      paths,
    );
    const malformed = expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' });

    expect(receipt(['y:2', 'y:1'])).toThrow(malformed);
    expect(receipt(['not-a-dot'])).toThrow(malformed);
    expect(receipt([1])).toThrow(malformed);
    expect(receipt(['y:1'])).not.toThrow();
  });
});

describe('node lifecycle shards written before records carried tombstoned dots (schema 2)', () => {
  const path = nodeLifecycleShardPath('readded');

  it('reads a schema-2 record as one whose entry holds no tombstoned dot', () => {
    const payload = { schemaVersion: 2, entries: [['readded', [[4, 'w', SHA, 0], null, [], []]]] };
    const records = decodeNodeLifecycleShard(codec.decode<CodecValue>(codec.encode(payload)), path);

    expect(records.get('readded')).toMatchObject({ birth: event(4), clear: null, tombstonedDots: [] });
  });

  it('reads a schema-2 receipt and reports the schema it was written under', () => {
    const payload = { schemaVersion: 2, nodeCount: 1, shardCount: 1, floatingTombstones: ['y:1'] };

    expect(decodeNodeLifecycleReceipt(codec.decode<CodecValue>(codec.encode(payload)), [path]))
      .toMatchObject({ schemaVersion: 2, nodeCount: 1, shardCount: 1, floatingTombstones: ['y:1'] });
  });

  it('refuses a receipt under a schema this runtime does not read', () => {
    expect(() => new NodeLifecycleReceipt({ schemaVersion: 4, nodeCount: 0, shardCount: 0, floatingTombstones: [] }))
      .toThrow(expect.objectContaining({ code: 'E_INVALID_SHARD' }));
  });

  it('refuses a schema-3 record without its tombstoned dots', () => {
    const malformed = expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' });

    expect(refusal({ schemaVersion: 3, entries: [['readded', [[4, 'w', SHA, 0], null, [], []]]] }, path))
      .toThrow(malformed);
  });

  it('refuses schema-3 record tombstoned dots that are not ascending encoded dots', () => {
    const record = (dots: CodecValue): CodecValue => ({
      schemaVersion: 3, entries: [['readded', [[4, 'w', SHA, 0], null, [], [], dots]]],
    });
    const malformed = expect.objectContaining({ code: 'E_INDEX_SHARD_MALFORMED' });

    expect(refusal(record(['w:2', 'w:1']), path)).toThrow(malformed);
    expect(refusal(record(['w:1', 'w:1']), path)).toThrow(malformed);
    expect(refusal(record(['not-a-dot']), path)).toThrow(malformed);
    expect(refusal(record([1]), path)).toThrow(malformed);
    expect(refusal(record('w:1'), path)).toThrow(malformed);
    expect(refusal(record(undefined), path)).toThrow(malformed);
    expect(refusal(record(['w:1', 'w:2']), path)).not.toThrow();
  });
});
