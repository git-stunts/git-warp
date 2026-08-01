import { describe, expect, it } from 'vitest';

import { Dot } from '../../../src/domain/crdt/Dot.ts';
import {
  applyIntentToPatch,
  intentFromPatch,
} from '../../../src/domain/api/IntentRuntime.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';
import { createPatchBuilder } from './services/PatchBuilderTestHarness.ts';

describe('IntentRuntime entity capture', () => {
  it('lowers one entity Intent into one dependency-pure patch', () => {
    const builder = createPatchBuilder({ graphName: 'think', writerId: 'claude' });

    applyIntentToPatch(Intent.addEntity({
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    }), builder);

    expect([...builder.reads]).toEqual([]);
    expect([...builder.writes]).toEqual(['entry:1']);
    expect(builder.build().ops).toHaveLength(3);
  });

  it('recovers an entity Intent from its persisted operations', () => {
    expect(intentFromPatch(patch([
      new NodeAdd('entry:1', Dot.create('claude', 1)),
      new NodePropSet('entry:1', 'kind', 'capture'),
      new NodePropSet('entry:1', 'text', 'a fact'),
    ])).descriptor).toEqual({
      kind: 'entity.add',
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact' },
    });
  });

  it('round-trips an entity Intent through a real PatchBuilder', () => {
    const builder = createPatchBuilder({ graphName: 'think', writerId: 'claude' });
    const original = Intent.addEntity({
      subject: 'entry:1',
      properties: { kind: 'capture', text: 'a fact', length: 6 },
    });
    applyIntentToPatch(original, builder);

    expect(intentFromPatch(builder.build()).descriptor)
      .toEqual(original.descriptor);
  });

  it('still recovers a bare NodeAdd as a node Intent', () => {
    expect(intentFromPatch(patch([
      new NodeAdd('entry:1', Dot.create('claude', 1)),
    ])).descriptor).toEqual({
      kind: 'node.add',
      subject: 'entry:1',
    });
  });

  it('rejects a NodeAdd whose payload writes a different node', () => {
    expect(() => intentFromPatch(patch([
      new NodeAdd('entry:1', Dot.create('claude', 1)),
      new NodePropSet('entry:2', 'kind', 'capture'),
    ]))).toThrowError(expect.objectContaining({
      code: 'E_DRAFT_INTENT_HYDRATION',
    }));
  });

  it('rejects properties that precede the node they belong to', () => {
    expect(() => intentFromPatch(patch([
      new NodePropSet('entry:1', 'kind', 'capture'),
      new NodeAdd('entry:1', Dot.create('claude', 1)),
    ]))).toThrowError(expect.objectContaining({
      code: 'E_DRAFT_INTENT_HYDRATION',
    }));
  });
});

function patch(ops: PatchOp[]): Patch {
  return new Patch({
    writer: 'claude',
    lamport: 1,
    context: {},
    ops,
  });
}
