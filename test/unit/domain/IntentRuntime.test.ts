import { describe, expect, it } from 'vitest';

import { Dot } from '../../../src/domain/crdt/Dot.ts';
import {
  applyIntentToPatch,
  intentFromPatch,
} from '../../../src/domain/api/IntentRuntime.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';
import { createPatchBuilder } from './services/PatchBuilderTestHarness.ts';

describe('IntentRuntime persisted hydration', () => {
  it('recovers every public one-operation Intent kind', () => {
    expect(intentFromPatch(patch([
      new NodeAdd('user:alice', Dot.create('review', 1)),
    ])).descriptor).toEqual({
      kind: 'node.add',
      subject: 'user:alice',
    });
    expect(intentFromPatch(patch([
      new NodeRemove('user:alice', ['review:1']),
    ])).descriptor).toEqual({
      kind: 'node.remove',
      subject: 'user:alice',
    });
    expect(intentFromPatch(patch([
      new EdgeAdd({
        from: 'user:alice',
        to: 'team:ops',
        label: 'member-of',
        dot: Dot.create('review', 2),
      }),
    ])).descriptor).toEqual({
      kind: 'edge.add',
      from: 'user:alice',
      to: 'team:ops',
      label: 'member-of',
    });
    expect(intentFromPatch(patch([
      new EdgeRemove({
        from: 'user:alice',
        to: 'team:ops',
        label: 'member-of',
        observedDots: ['review:2'],
      }),
    ])).descriptor).toEqual({
      kind: 'edge.remove',
      from: 'user:alice',
      to: 'team:ops',
      label: 'member-of',
    });
    expect(intentFromPatch(patch([
      new NodePropSet('user:alice', 'role', 'admin'),
    ])).descriptor).toEqual({
      kind: 'property.set',
      subject: 'user:alice',
      key: 'role',
      value: 'admin',
    });
  });

  it('recovers a cascading node removal as one public Intent', () => {
    expect(intentFromPatch(patch([
      new EdgeRemove({
        from: 'user:alice',
        to: 'team:ops',
        label: 'member-of',
        observedDots: ['review:2'],
      }),
      new NodeRemove('user:alice', ['review:1']),
    ])).descriptor).toEqual({
      kind: 'node.remove',
      subject: 'user:alice',
    });
  });

  it('rejects patches that cannot represent one public Intent', () => {
    expect(() => intentFromPatch(patch([
      new NodeAdd('user:alice', Dot.create('review', 1)),
      new NodeAdd('user:bob', Dot.create('review', 2)),
    ]))).toThrowError(expect.objectContaining({
      code: 'E_DRAFT_INTENT_HYDRATION',
    }));
  });

  it('round-trips a property Intent through a real PatchBuilder', () => {
    const builder = createPatchBuilder({
      graphName: 'users',
      writerId: 'review',
    });
    const original = Intent.setProperty({
      subject: 'user:alice',
      key: 'role',
      value: 'admin',
    });
    applyIntentToPatch(original, builder);

    expect(intentFromPatch(builder.build()).descriptor)
      .toEqual(original.descriptor);
  });
});

function patch(ops: PatchOp[]): Patch {
  return new Patch({
    writer: 'review',
    lamport: 1,
    context: {},
    ops,
  });
}
