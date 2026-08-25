import { describe, expect, it } from 'vitest';

import Intent from '../../../src/domain/api/Intent.ts';
import IntentSequence from '../../../src/domain/api/IntentSequence.ts';
import { inspectPublishedIntentSequence } from '../../../src/domain/api/PublishedIntentSequence.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import EdgeAdd from '../../../src/domain/types/ops/EdgeAdd.ts';
import EdgeRemove from '../../../src/domain/types/ops/EdgeRemove.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import NodeRemove from '../../../src/domain/types/ops/NodeRemove.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';

describe('PublishedIntentSequence', () => {
  it('accepts exact ordered primitive edits and cascading node removal', () => {
    const sequence = IntentSequence.from([
      Intent.addNode({ subject: 'capture:first' }),
      Intent.addEdge({
        from: 'capture:first',
        to: 'capture:second',
        label: 'precedes',
      }),
      Intent.setProperty({
        subject: 'capture:first',
        key: 'body',
        value: 'one',
      }),
      Intent.removeEdge({
        from: 'capture:first',
        to: 'capture:second',
        label: 'precedes',
      }),
      Intent.removeNode({ subject: 'capture:first' }),
    ]);
    const published = patch([
      new NodeAdd('capture:first', Dot.create('agent-1', 1)),
      edgeAdd({ from: 'capture:first', to: 'capture:second', label: 'precedes', counter: 2 }),
      new NodePropSet('capture:first', 'body', 'one'),
      edgeRemove({ from: 'capture:first', to: 'capture:second', label: 'precedes' }),
      edgeRemove({ from: 'capture:first', to: 'capture:third', label: 'relates' }),
      edgeRemove({ from: 'capture:fourth', to: 'capture:first', label: 'relates' }),
      new NodeRemove('capture:first', ['agent-1:1']),
    ]);

    expect(inspectPublishedIntentSequence(sequence, published)).toEqual([]);
  });

  it('rejects an unrelated edge hidden in a cascading node removal', () => {
    const sequence = IntentSequence.from([Intent.removeNode({ subject: 'capture:first' })]);
    const published = patch([
      edgeRemove({ from: 'capture:second', to: 'capture:third', label: 'relates' }),
      new NodeRemove('capture:first', ['agent-1:1']),
    ]);

    expect(() => inspectPublishedIntentSequence(sequence, published)).toThrowError(
      expect.objectContaining({ code: 'E_WRITE_INTENT_PUBLICATION' })
    );
  });

  it.each([
    {
      name: 'node addition',
      requested: Intent.addNode({ subject: 'capture:first' }),
      operations: [new NodeAdd('capture:other', Dot.create('agent-1', 1))],
      code: 'E_WRITE_INTENT_PUBLICATION',
    },
    {
      name: 'node removal',
      requested: Intent.removeNode({ subject: 'capture:first' }),
      operations: [new NodeAdd('capture:first', Dot.create('agent-1', 1))],
      code: 'E_WRITE_INTENT_PUBLICATION',
    },
    {
      name: 'edge addition',
      requested: Intent.addEdge({
        from: 'capture:first',
        to: 'capture:second',
        label: 'precedes',
      }),
      operations: [
        edgeAdd({
          from: 'capture:first',
          to: 'capture:second',
          label: 'substituted',
          counter: 1,
        }),
      ],
      code: 'E_WRITE_INTENT_PUBLICATION',
    },
    {
      name: 'edge removal',
      requested: Intent.removeEdge({
        from: 'capture:first',
        to: 'capture:second',
        label: 'precedes',
      }),
      operations: [
        edgeAdd({
          from: 'capture:first',
          to: 'capture:second',
          label: 'precedes',
          counter: 1,
        }),
      ],
      code: 'E_WRITE_INTENT_PUBLICATION',
    },
    {
      name: 'property write',
      requested: Intent.setProperty({
        subject: 'capture:first',
        key: 'body',
        value: 'one',
      }),
      operations: [new NodeAdd('capture:first', Dot.create('agent-1', 1))],
      code: 'E_WRITE_INTENT_PUBLICATION',
    },
    {
      name: 'entity leading operation',
      requested: Intent.addEntity({
        subject: 'capture:first',
        properties: { body: 'one' },
      }),
      operations: [new NodePropSet('capture:first', 'body', 'one')],
      code: 'E_WRITE_ENTITY_OCCURRENCE',
    },
    {
      name: 'entity property operation',
      requested: Intent.addEntity({
        subject: 'capture:first',
        properties: { body: 'one' },
      }),
      operations: [
        new NodeAdd('capture:first', Dot.create('agent-1', 1)),
        edgeAdd({
          from: 'capture:first',
          to: 'capture:second',
          label: 'precedes',
          counter: 2,
        }),
      ],
      code: 'E_WRITE_ENTITY_OCCURRENCE',
    },
  ])('rejects a substituted $name', ({ requested, operations, code }) => {
    const sequence = IntentSequence.from([requested]);

    expect(() => inspectPublishedIntentSequence(sequence, patch(operations))).toThrowError(
      expect.objectContaining({ code })
    );
  });
});

type EdgeFields = Readonly<{
  readonly from: string;
  readonly to: string;
  readonly label: string;
}>;

function edgeAdd(fields: EdgeFields & { readonly counter: number }): EdgeAdd {
  return new EdgeAdd({
    from: fields.from,
    to: fields.to,
    label: fields.label,
    dot: Dot.create('agent-1', fields.counter),
  });
}

function edgeRemove(fields: EdgeFields): EdgeRemove {
  return new EdgeRemove({
    from: fields.from,
    to: fields.to,
    label: fields.label,
    observedDots: ['agent-1:1'],
  });
}

function patch(ops: PatchOp[]): Patch {
  return new Patch({
    writer: 'agent-1',
    lamport: 1,
    context: {},
    ops,
  });
}
