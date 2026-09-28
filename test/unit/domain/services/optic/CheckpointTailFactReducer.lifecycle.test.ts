/**
 * A checkpoint-tail property read applies the lifecycle rule: an add or
 * remove of the node in the tail hides the checkpoint's value and every tail
 * write that sorts before it. The reducer already treats tail writes as
 * newer than the checkpoint, so a tail add or remove is newer than every
 * checkpointed register too.
 */

import { describe, expect, it } from 'vitest';
import { Dot, encodeDot } from '../../../../../src/domain/crdt/Dot.ts';
import CheckpointTailFactReducer from '../../../../../src/domain/services/optic/CheckpointTailFactReducer.ts';
import type { CheckpointTailPatchEntry } from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../../../src/domain/types/ops/NodeRemove.ts';

const NODE = 'node:target';
const KEY = 'status';
const reducer = new CheckpointTailFactReducer({ graphName: 'lifecycle' });

function entry(lamport: number, ops: Patch['ops'], sha: string): CheckpointTailPatchEntry {
  return { sha, patch: new Patch({ schema: 3, writer: 'writer-a', lamport, context: {}, ops }) };
}

function read(baseValue: string | undefined, tailEntries: readonly CheckpointTailPatchEntry[]) {
  return reducer.reduceProperty({ baseValue, tailEntries, nodeId: NODE, propertyKey: KEY });
}

describe('checkpoint-tail property reads across a node lifecycle', () => {
  it('scans tail patches that add or remove the node, not only its property writes', () => {
    expect(reducer.includesProperty(entry(3, [new NodeAdd(NODE, Dot.create('writer-a', 9))], 'aaaa'), NODE, KEY)).toBe(true);
    expect(reducer.includesProperty(
      entry(3, [new NodeRemove(NODE, [encodeDot(Dot.create('writer-a', 1))])], 'aaaa'),
      NODE,
      KEY,
    )).toBe(true);
    expect(reducer.includesProperty(entry(3, [new NodeAdd('node:other', Dot.create('writer-a', 9))], 'aaaa'), NODE, KEY)).toBe(false);
  });

  it('hides the checkpoint value after a tail re-add', () => {
    expect(read('old', [entry(3, [new NodeAdd(NODE, Dot.create('writer-a', 9))], 'aaaa')])).toBeUndefined();
  });

  it('hides a tail write that predates a later tail remove', () => {
    expect(read('old', [
      entry(3, [new NodePropSet(NODE, KEY, 'tail')], 'aaaa'),
      entry(4, [new NodeRemove(NODE, [encodeDot(Dot.create('writer-a', 1))])], 'bbbb'),
    ])).toBeUndefined();
  });

  it('shows a tail write made after the tail re-add', () => {
    expect(read('old', [
      entry(3, [new NodeAdd(NODE, Dot.create('writer-a', 9)), new NodePropSet(NODE, KEY, 'fresh')], 'aaaa'),
    ])).toBe('fresh');
  });

  it('keeps the checkpoint value when the tail does not touch the node lifecycle', () => {
    expect(read('old', [entry(3, [new NodeAdd('node:other', Dot.create('writer-a', 9))], 'aaaa')])).toBe('old');
  });
});
