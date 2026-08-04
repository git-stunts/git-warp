import { describe, expect, it } from 'vitest';

import type {
  ApiRuntimeContext,
  ReceiptProvenance,
} from '../../../src/domain/api/ApiRuntimeContext.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import { executeIntentWrite } from '../../../src/domain/api/WriteRuntime.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import WriterError from '../../../src/domain/errors/WriterError.ts';
import { encodeEdgeKey } from '../../../src/domain/services/KeyCodec.ts';
import type { PatchBuilder } from '../../../src/domain/services/PatchBuilder.ts';
import WarpState from '../../../src/domain/services/state/WarpState.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import PropSet from '../../../src/domain/types/ops/PropSet.ts';
import type { PatchOp } from '../../../src/domain/types/ops/unions.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import { testDerivedIntentAdmissionReceipt } from '../../helpers/intentAdmission.ts';
import {
  createPatchBuilder,
  createPatchBuilderMockPersistence,
  createPatchJournal,
} from './services/PatchBuilderTestHarness.ts';

describe('WriteRuntime admission classification', () => {
  it('issues the substrate occurrence from the causally published entity patch', async () => {
    const { context, provenance } = createContext();
    const receipt = await executeIntentWrite({
      runtime: createRuntime(),
      context,
      intent: intent.entity.addAuto({
        namespace: 'entry',
        properties: { kind: 'capture', capturedAt: '2026-08-03T20:00:00.000Z' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        return await capture.commitWithEvidence();
      },
    });

    const occurrence = receipt.occurrence;
    expect(occurrence).toBeDefined();
    if (occurrence === undefined) {
      throw new Error('entity write must return an occurrence');
    }
    expect(occurrence.subject).toMatch(/^entry:[0-9a-f]+$/);
    expect(occurrence.id).toMatch(/^occurrence:[0-9a-f]+$/);
    expect(occurrence.relationTo(occurrence)).toBe('same');
    expect(occurrence.compare(occurrence)).toBe(0);
    expect(provenance).toEqual([{ operation: 'write', patchSha: expect.any(String) }]);
  });

  it('refuses a published entity receipt whose patch lost its NodeAdd coordinate', async () => {
    await expect(executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.entity.add({
        subject: 'entry:1',
        properties: { kind: 'capture' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        const publication = await capture.commitWithEvidence();
        const replacement = patchWithOps(publication.patch, []);
        expectPreservedPatchMetadata(replacement, publication.patch);
        return Object.freeze({ ...publication, patch: replacement });
      },
    })).rejects.toMatchObject({ code: 'E_WRITE_ENTITY_OCCURRENCE' });
  });

  it('refuses a published entity receipt whose patch is not an entity capture', async () => {
    await expect(executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.entity.add({
        subject: 'entry:1',
        properties: { kind: 'capture' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        const publication = await capture.commitWithEvidence();
        const leading = requireNodeAdd(publication.patch.ops[0]);
        const replacement = patchWithOps(publication.patch, [leading]);
        expect(replacement.ops[0]).toBe(leading);
        expectPreservedPatchMetadata(replacement, publication.patch);
        return Object.freeze({ ...publication, patch: replacement });
      },
    })).rejects.toMatchObject({ code: 'E_WRITE_ENTITY_OCCURRENCE' });
  });

  it('refuses a published entity receipt whose supplied subject changed', async () => {
    await expect(executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.entity.add({
        subject: 'entry:1',
        properties: { kind: 'capture' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        const publication = await capture.commitWithEvidence();
        const replacement = renameEntitySubject(publication.patch, 'entry:1', 'entry:2');
        expect(requireNodeAdd(replacement.ops[0]).dot)
          .toBe(requireNodeAdd(publication.patch.ops[0]).dot);
        expectPreservedPatchMetadata(replacement, publication.patch, ['entry:2']);
        return Object.freeze({
          ...publication,
          patch: replacement,
        });
      },
    })).rejects.toMatchObject({ code: 'E_WRITE_ENTITY_OCCURRENCE' });
  });

  it('refuses a supplied-subject publication whose payload changed', async () => {
    await expect(executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.entity.add({
        subject: 'entry:1',
        properties: { kind: 'requested' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        const publication = await capture.commitWithEvidence();
        const replacement = replaceEntityProperty(publication.patch, 'kind', 'substituted');
        expect(replacement.ops[0]).toBe(publication.patch.ops[0]);
        expectPreservedPatchMetadata(replacement, publication.patch);
        return Object.freeze({
          ...publication,
          patch: replacement,
        });
      },
    })).rejects.toMatchObject({ code: 'E_WRITE_ENTITY_OCCURRENCE' });
  });

  it('refuses an auto-allocated publication whose payload changed', async () => {
    await expect(executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.entity.addAuto({
        namespace: 'entry',
        properties: { kind: 'requested' },
      }),
      commit: async (build) => {
        const capture = committableBuilder();
        await build(capture);
        const publication = await capture.commitWithEvidence();
        const replacement = replaceEntityProperty(publication.patch, 'kind', 'substituted');
        expect(replacement.ops[0]).toBe(publication.patch.ops[0]);
        expectPreservedPatchMetadata(replacement, publication.patch);
        return Object.freeze({
          ...publication,
          patch: replacement,
        });
      },
    })).rejects.toMatchObject({ code: 'E_WRITE_ENTITY_OCCURRENCE' });
  });

  it('classifies writer CAS races as stale-basis obstructions', async () => {
    const { context, provenance } = createContext();
    const receipt = await executeIntentWrite({
      runtime: createRuntime(),
      context,
      intent: intent.node.add({ subject: 'user:alice' }),
      commit: async (build) => {
        await build(builder({ expectedParentSha: 'old-head' }));
        const error = new WriterError('writer advanced', { code: 'WRITER_CAS_CONFLICT' });
        error.expectedSha = 'old-head';
        error.actualSha = 'new-head';
        throw error;
      },
    });

    expect(receipt.outcome.kind).toBe('obstruction');
    if (receipt.outcome.kind !== 'obstruction') {
      throw new Error('writer CAS race must produce an obstruction');
    }
    expect(receipt.outcome.witness.reason).toMatchObject({
      family: 'stale-basis',
      code: 'git-warp.write.writer-frontier-advanced',
    });
    expect(receipt.outcome.witness.evaluation.sourceBasis.id).toMatch(/^evidence:/);
    expect(receipt.outcome.witness.evaluation.destinationBasis.id).toMatch(/^evidence:/);
    expect(receipt.outcome.witness.evaluation.sourceBasis).not.toEqual(
      receipt.outcome.witness.evaluation.destinationBasis
    );
    expect(receipt.outcome.residual).toMatchObject({
      kind: 'unchanged',
      frontier: receipt.outcome.witness.evaluation.destinationBasis,
    });
    expect(provenance).toEqual([{ operation: 'write', patchSha: undefined }]);
  });

  it('classifies an attached-data deletion as a law obstruction, not conflict', async () => {
    const state = stateWithAttachedEdge();
    const receipt = await executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.node.remove({ subject: 'user:alice' }),
      commit: async (build) => {
        await build(
          builder({
            getCurrentState: () => state,
            onDeleteWithData: 'reject',
          })
        );
        throw new Error('unreachable publication');
      },
    });

    expect(receipt.outcome.kind).toBe('obstruction');
    if (receipt.outcome.kind !== 'obstruction') {
      throw new Error('attached-data deletion must produce an obstruction');
    }
    expect(receipt.outcome.witness.reason).toMatchObject({
      family: 'law-violation',
      code: 'git-warp.write.delete-with-attached-data',
    });
    expect(receipt.outcome.witness.retry.disposition).toBe('after-change');
  });

  it('classifies a missing write target as a law obstruction, not rejection', async () => {
    const receipt = await executeIntentWrite({
      runtime: createRuntime(),
      context: createContext().context,
      intent: intent.node.remove({ subject: 'user:alice' }),
      commit: async (build) => {
        await build(builder({ getCurrentState: () => WarpState.empty() }));
        throw new Error('unreachable publication');
      },
    });

    expect(receipt.outcome.kind).toBe('obstruction');
    if (receipt.outcome.kind !== 'obstruction') {
      throw new Error('missing write target must produce an obstruction');
    }
    expect(receipt.outcome.witness.reason).toMatchObject({
      family: 'law-violation',
      code: 'git-warp.write.entity-not-found',
    });
  });

  it('keeps operational failures outside the causal outcome union', async () => {
    await expect(
      executeIntentWrite({
        runtime: createRuntime(),
        context: createContext().context,
        intent: intent.node.add({ subject: 'user:alice' }),
        commit: async (build) => {
          await build(builder());
          throw new Error('storage unavailable');
        },
      })
    ).rejects.toThrow('storage unavailable');
  });

  it('rejects a publication basis owned by another writer', async () => {
    await expect(
      executeIntentWrite({
        runtime: createRuntime(),
        context: createContext().context,
        intent: intent.node.add({ subject: 'user:alice' }),
        commit: async (build) => {
          await build(builder({ writerId: 'agent-2' }));
          throw new Error('unreachable publication');
        },
      })
    ).rejects.toMatchObject({
      code: 'E_WRITE_ADMISSION_BASIS',
    });
  });
});

function builder(overrides: Parameters<typeof createPatchBuilder>[0] = {}): PatchBuilder {
  return createPatchBuilder({
    graphName: 'events',
    writerId: 'agent-1',
    evaluationCoordinateRef: 'warp:test-coordinate:events',
    ...overrides,
  });
}

function committableBuilder(): PatchBuilder {
  const persistence = createPatchBuilderMockPersistence();
  return builder({ persistence, patchJournal: createPatchJournal(persistence) });
}

function requireNodeAdd(op: object | undefined): NodeAdd {
  if (op instanceof NodeAdd) {
    return op;
  }
  throw new Error('expected a leading NodeAdd');
}

function patchWithOps(
  patch: Patch,
  ops: PatchOp[],
  writes: string[] | undefined = patch.writes,
): Patch {
  return new Patch({
    schema: patch.schema,
    writer: patch.writer,
    lamport: patch.lamport,
    context: patch.context,
    ops,
    reads: patch.reads,
    writes,
  });
}

function renameEntitySubject(patch: Patch, from: string, to: string): Patch {
  const ops = patch.ops.map((op) => renameEntityOperation(op, from, to));
  const writes = patch.writes?.map((subject) => subject === from ? to : subject);
  return patchWithOps(patch, ops, writes);
}

function renameEntityOperation(op: PatchOp, from: string, to: string): PatchOp {
  if (op instanceof NodeAdd && op.node === from) {
    return new NodeAdd(to, op.dot);
  }
  if (op instanceof NodePropSet && op.node === from) {
    return new NodePropSet(to, op.key, op.value);
  }
  if (op instanceof PropSet && op.node === from) {
    return new PropSet(to, op.key, op.value);
  }
  return op;
}

function replaceEntityProperty(patch: Patch, key: string, value: string): Patch {
  return patchWithOps(patch, patch.ops.map((op) =>
    replaceEntityPropertyOperation(op, key, value)
  ));
}

function replaceEntityPropertyOperation(op: PatchOp, key: string, value: string): PatchOp {
  if (op instanceof NodePropSet && op.key === key) {
    return new NodePropSet(op.node, op.key, value);
  }
  if (op instanceof PropSet && op.key === key) {
    return new PropSet(op.node, op.key, value);
  }
  return op;
}

function expectPreservedPatchMetadata(
  replacement: Patch,
  publication: Patch,
  writes: string[] | undefined = publication.writes,
): void {
  expect(replacement.schema).toBe(publication.schema);
  expect(replacement.writer).toBe(publication.writer);
  expect(replacement.lamport).toBe(publication.lamport);
  expect(replacement.context).toEqual(publication.context);
  expect(replacement.reads).toEqual(publication.reads);
  expect(replacement.writes).toEqual(writes);
}

function stateWithAttachedEdge(): WarpState {
  const state = WarpState.empty();
  state.nodeAlive.add('user:alice', Dot.create('agent-1', 1));
  state.nodeAlive.add('team:ops', Dot.create('agent-1', 2));
  state.edgeAlive.add(
    encodeEdgeKey('user:alice', 'team:ops', 'memberOf'),
    Dot.create('agent-1', 3)
  );
  return state;
}

function createRuntime(): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events',
    writerId: 'agent-1',
    commitPatch: async () => {
      throw new Error('unused commit');
    },
    createWorldline: () => {
      throw new Error('unused worldline');
    },
    admitIntent: async (descriptor) => testDerivedIntentAdmissionReceipt(descriptor.intentId),
  });
}

function createContext(): {
  readonly context: ApiRuntimeContext;
  readonly provenance: ReceiptProvenance[];
} {
  const provenance: ReceiptProvenance[] = [];
  return {
    context: {
      createOpaqueId: async (namespace, parts) => `${namespace}:${parts.join(':')}`,
      reserveRecoveryNonce: () => 'write-runtime:1',
      bindReceipt: (_receipt, receiptProvenance) => provenance.push(receiptProvenance),
    },
    provenance,
  };
}
