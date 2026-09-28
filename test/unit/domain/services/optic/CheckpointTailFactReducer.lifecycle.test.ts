/**
 * A checkpoint-tail property read applies the node lifecycle rule: a remove
 * of the node in the tail, followed by a later add, hides the checkpoint's
 * value and every tail write that sorts before that remove. The reducer
 * already treats tail writes as newer than the checkpoint, so tail adds and
 * removes are newer than every checkpointed register and add too. This read
 * does not decide liveness; the node-liveness read does that separately.
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

  it('keeps the checkpoint value when a tail add finds the node live', () => {
    expect(read('old', [entry(3, [new NodeAdd(NODE, Dot.create('writer-a', 9))], 'aaaa')])).toBe('old');
  });

  it('hides the checkpoint value after a tail remove and re-add', () => {
    expect(read('old', [
      entry(3, [new NodeRemove(NODE, [encodeDot(Dot.create('writer-a', 1))])], 'aaaa'),
      entry(4, [new NodeAdd(NODE, Dot.create('writer-a', 9))], 'bbbb'),
    ])).toBeUndefined();
  });

  it('hides a tail write that predates a tail remove and re-add', () => {
    expect(read('old', [
      entry(3, [new NodePropSet(NODE, KEY, 'tail')], 'aaaa'),
      entry(4, [new NodeRemove(NODE, [encodeDot(Dot.create('writer-a', 1))])], 'bbbb'),
      entry(5, [new NodeAdd(NODE, Dot.create('writer-a', 9))], 'cccc'),
    ])).toBeUndefined();
  });

  it('keeps a tail write when no add follows the tail remove', () => {
    expect(read('old', [
      entry(3, [new NodePropSet(NODE, KEY, 'tail')], 'aaaa'),
      entry(4, [new NodeRemove(NODE, [encodeDot(Dot.create('writer-a', 1))])], 'bbbb'),
    ])).toBe('tail');
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
