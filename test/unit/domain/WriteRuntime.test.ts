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
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import { testDerivedIntentAdmissionReceipt } from '../../helpers/intentAdmission.ts';
import { createPatchBuilder } from './services/PatchBuilderTestHarness.ts';

describe('WriteRuntime admission classification', () => {
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
