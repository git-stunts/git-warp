import { describe, expect, it } from 'vitest';

import { Dot } from '../../../src/domain/crdt/Dot.ts';
import { applyIntentToPatch, intentFromPatch } from '../../../src/domain/api/IntentRuntime.ts';
import Intent from '../../../src/domain/api/Intent.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';
import { createPatchBuilder } from './services/PatchBuilderTestHarness.ts';

describe('IntentRuntime entity capture', () => {
  it('lowers one entity Intent into one single-subject patch', () => {
    const builder = createPatchBuilder({ graphName: 'think', writerId: 'claude' });

    applyIntentToPatch(
      Intent.addEntity({
        subject: 'entry:1',
        properties: { kind: 'capture', text: 'a fact' },
      }),
      builder
    );

    expect([...builder.reads]).toEqual([]);
    expect([...builder.writes]).toEqual(['entry:1']);
    expect(builder.build().ops).toHaveLength(3);
  });

  it('allocates an opaque subject from the NodeAdd dot', () => {
    const builder = createPatchBuilder({ graphName: 'think', writerId: 'claude' });

    applyIntentToPatch(
      Intent.addEntityAuto({
        namespace: 'entry',
        properties: { kind: 'capture', capturedAt: '2026-08-03T20:00:00.000Z' },
      }),
      builder
    );

    const built = builder.build();
    const leading = built.ops[0];
    expect(leading).toBeInstanceOf(NodeAdd);
    if (!(leading instanceof NodeAdd)) {
      throw new Error('expected allocated entity to begin with NodeAdd');
    }
    expect(leading.node).toMatch(/^entry:[0-9a-f]+$/);
    expect([...builder.reads]).toEqual([]);
    expect([...builder.writes]).toEqual([leading.node]);
    expect(built.ops).toHaveLength(3);
  });

  it('recovers an entity Intent from its persisted operations', () => {
    expect(
      intentFromPatch(
        entityPatch('entry:1', [
          new NodeAdd('entry:1', Dot.create('claude', 1)),
          new NodePropSet('entry:1', 'kind', 'capture'),
          new NodePropSet('entry:1', 'text', 'a fact'),
        ])
      ).descriptor
    ).toEqual({
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

    expect(intentFromPatch(builder.build()).descriptor).toEqual(original.descriptor);
  });

  it('still recovers a bare NodeAdd as a node Intent', () => {
    expect(
      intentFromPatch(
        patch([new NodeAdd('entry:1', Dot.create('claude', 1))], { writes: ['entry:1'] })
      ).descriptor
    ).toEqual({
      kind: 'node.add',
      subject: 'entry:1',
    });
  });

  it('rejects a NodeAdd whose payload writes a different node', () => {
    expect(() =>
      intentFromPatch(
        patch(
          [
            new NodeAdd('entry:1', Dot.create('claude', 1)),
            new NodePropSet('entry:2', 'kind', 'capture'),
          ],
          { writes: ['entry:1', 'entry:2'] }
        )
      )
    ).toThrowError(
      expect.objectContaining({
        code: 'E_DRAFT_INTENT_HYDRATION',
      })
    );
  });

  it('rejects properties that precede the node they belong to', () => {
    expect(() =>
      intentFromPatch(
        entityPatch('entry:1', [
          new NodePropSet('entry:1', 'kind', 'capture'),
          new NodeAdd('entry:1', Dot.create('claude', 1)),
        ])
      )
    ).toThrowError(
      expect.objectContaining({
        code: 'E_DRAFT_INTENT_HYDRATION',
      })
    );
  });

  describe('footprint is evidence, not decoration', () => {
    it('refuses to read entity capture into a patch that records a read', () => {
      expect(() =>
        intentFromPatch(
          patch(
            [
              new NodeAdd('entry:1', Dot.create('claude', 1)),
              new NodePropSet('entry:1', 'kind', 'capture'),
            ],
            { reads: ['entry:1'], writes: ['entry:1'] }
          )
        )
      ).toThrowError(expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }));
    });

    it('refuses a patch that writes more than the created subject', () => {
      expect(() =>
        intentFromPatch(
          patch(
            [
              new NodeAdd('entry:1', Dot.create('claude', 1)),
              new NodePropSet('entry:1', 'kind', 'capture'),
            ],
            { writes: ['entry:1', 'entry:2'] }
          )
        )
      ).toThrowError(expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }));
    });

    it('refuses a patch that records no footprint at all', () => {
      expect(() =>
        intentFromPatch(
          patch([
            new NodeAdd('entry:1', Dot.create('claude', 1)),
            new NodePropSet('entry:1', 'kind', 'capture'),
          ])
        )
      ).toThrowError(expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }));
    });

    it('refuses a patch whose single write names another subject', () => {
      expect(() =>
        intentFromPatch(
          patch(
            [
              new NodeAdd('entry:1', Dot.create('claude', 1)),
              new NodePropSet('entry:1', 'kind', 'capture'),
            ],
            { writes: ['entry:2'] }
          )
        )
      ).toThrowError(expect.objectContaining({ code: 'E_DRAFT_INTENT_HYDRATION' }));
    });
  });

  describe('hostile persisted payloads', () => {
    it('refuses a payload that sets the same key twice', () => {
      expect(() =>
        intentFromPatch(
          entityPatch('entry:1', [
            new NodeAdd('entry:1', Dot.create('claude', 1)),
            new NodePropSet('entry:1', 'kind', 'capture'),
            new NodePropSet('entry:1', 'kind', 'annotation'),
          ])
        )
      ).toThrowError(
        expect.objectContaining({
          code: 'E_DRAFT_INTENT_HYDRATION',
        })
      );
    });

    it('treats a prototype-shaped key as ordinary data', () => {
      const recovered = intentFromPatch(
        entityPatch('entry:1', [
          new NodeAdd('entry:1', Dot.create('claude', 1)),
          new NodePropSet('entry:1', '__proto__', 'polluted'),
        ])
      ).descriptor;

      expect(recovered).toEqual(
        expect.objectContaining({
          kind: 'entity.add',
          subject: 'entry:1',
        })
      );
      if (recovered.kind !== 'entity.add') {
        throw new Error('expected an entity.add descriptor');
      }
      expect(Object.hasOwn(recovered.properties, '__proto__')).toBe(true);
      expect({}.constructor).toBe(Object);
      expect(Object.getOwnPropertyDescriptor(Object.prototype, 'polluted')).toBeUndefined();
    });
  });

  describe('canonical property order', () => {
    it('lowers payloads that differ only in construction order identically', () => {
      expect(opSignature({ kind: 'capture', text: 'hello' })).toEqual(
        opSignature({ text: 'hello', kind: 'capture' })
      );
    });

    it('produces byte-identical patch operations regardless of key order', () => {
      expect(JSON.stringify(opSignature({ b: 2, a: 1, c: 3 }))).toBe(
        JSON.stringify(opSignature({ c: 3, a: 1, b: 2 }))
      );
    });
  });
});

function opSignature(properties: Record<string, string | number>) {
  const builder = createPatchBuilder({ graphName: 'think', writerId: 'claude' });
  applyIntentToPatch(Intent.addEntity({ subject: 'entry:1', properties }), builder);
  return builder.build().ops.map((op) => ({ ...op }));
}

function entityPatch(subject: string, ops: PatchOp[]): Patch {
  return patch(ops, { writes: [subject] });
}

function patch(ops: PatchOp[], footprint: { reads?: string[]; writes?: string[] } = {}): Patch {
  return new Patch({
    writer: 'claude',
    lamport: 1,
    context: {},
    ops,
    reads: footprint.reads,
    writes: footprint.writes,
  });
}
