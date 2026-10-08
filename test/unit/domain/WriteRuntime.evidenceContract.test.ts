import { expect, it, vi } from 'vitest';
import { executeIntentWrite } from '../../../src/domain/api/WriteRuntime.ts';
import { intent } from '../../../src/domain/api/IntentBuilders.ts';
import type { ApiRuntimeContext } from '../../../src/domain/api/ApiRuntimeContext.ts';
import PatchError from '../../../src/domain/errors/PatchError.ts';
import WriterError from '../../../src/domain/errors/WriterError.ts';
import WarpWorldline from '../../../src/domain/WarpWorldline.ts';
import WarpState from '../../../src/domain/services/state/WarpState.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { createPatchBuilder, createPatchBuilderMockPersistence, createPatchJournal } from './services/PatchBuilderTestHarness.ts';
import { testDerivedIntentAdmissionReceipt } from '../../helpers/intentAdmission.ts';

function runtime(): WarpWorldline {
  return new WarpWorldline({
    worldlineName: 'events', writerId: 'agent-1',
    commitPatch: async () => { throw new Error('unused commit capability'); },
    createWorldline: () => { throw new Error('unused worldline capability'); },
    admitIntent: async descriptor => testDerivedIntentAdmissionReceipt(descriptor.intentId),
  });
}
function context(overrides: Partial<ApiRuntimeContext> = {}): ApiRuntimeContext {
  return {
    createOpaqueId: async (namespace, parts) => `${namespace}:${parts.join(':')}`,
    reserveRecoveryNonce: () => 'write-contract:1',
    bindReceipt: () => {}, ...overrides,
  };
}
function fixture(getCurrentState = (): WarpState | null => null) {
  const persistence = createPatchBuilderMockPersistence();
  const journal = createPatchJournal(persistence);
  const patch = createPatchBuilder({
    graphName: 'events', writerId: 'agent-1', evaluationCoordinateRef: 'warp:test-coordinate:events',
    persistence, patchJournal: journal, getCurrentState,
  });
  return { persistence, journal, patch };
}

it('preserves a typed operational failure before any callback basis exists', async () => {
  const failure = new PatchError('publication capability unavailable', { code: 'E_PATCH_NO_STATE' });
  const { journal } = fixture();
  await expect(executeIntentWrite({
    runtime: runtime(), context: context(), intent: intent.node.add({ subject: 'new' }),
    commit: async () => { throw failure; },
  })).rejects.toBe(failure);
  expect(journal.requests).toHaveLength(0);
});

it('preserves evaluation capability failure rather than inventing admission evidence', async () => {
  const failure = new PatchError('evaluation identity unavailable', { code: 'E_PATCH_NO_STATE' });
  const { journal, patch } = fixture();
  await expect(executeIntentWrite({
    runtime: runtime(), intent: intent.node.add({ subject: 'new' }),
    context: context({ createOpaqueId: async (namespace, parts) => {
      if (namespace === 'admission') { throw failure; }
      return `${namespace}:${parts.join(':')}`;
    } }),
    commit: async build => { await build(patch); return await patch.commitWithEvidence(); },
  })).rejects.toBe(failure);
  expect(journal.requests).toHaveLength(0);
});

it('refuses a receipt when a faulty commit capability suppresses callback evidence failure', async () => {
  const failure = new PatchError('intent inventory unavailable', { code: 'E_PATCH_NO_STATE' });
  const { journal, patch } = fixture();
  vi.spyOn(patch, 'build').mockImplementationOnce(() => { throw failure; });
  await expect(executeIntentWrite({
    runtime: runtime(), context: context(), intent: intent.node.add({ subject: 'new' }),
    commit: async build => {
      try { await build(patch); } catch (error) { if (error !== failure) { throw error; } }
      return await patch.commitWithEvidence();
    },
  })).rejects.toMatchObject({ code: 'E_WRITE_ADMISSION_BASIS' });
  // This deliberately faulty acknowledgement capability cannot establish real Git durability.
  expect(journal.requests).toHaveLength(1);
});

it('preserves acknowledged publication with recovery evidence when correlation fails', async () => {
  const { journal, patch } = fixture();
  const receipt = await executeIntentWrite({
    runtime: runtime(), intent: intent.node.add({ subject: 'new' }),
    context: context({ createOpaqueId: async (namespace, parts) => {
      if (parts[0] === 'write') { throw new Error('correlation capability unavailable'); }
      return `${namespace}:${parts.join(':')}`;
    } }),
    commit: async build => { await build(patch); return await patch.commitWithEvidence(); },
  });
  expect(receipt.outcome.kind).toBe('derived');
  expect(receipt.evidence.basis.id).toContain('recovery');
  expect(receipt.evidence.support).toEqual([]);
  expect(journal.requests).toHaveLength(1);
});

it('does not invent a stale frontier when a writer conflict omits its actual head', async () => {
  const failure = new WriterError('writer conflict without a witness', { code: 'WRITER_CAS_CONFLICT' });
  const { journal, patch } = fixture();
  await expect(executeIntentWrite({
    runtime: runtime(), context: context(), intent: intent.node.add({ subject: 'new' }),
    commit: async build => { await build(patch); throw failure; },
  })).rejects.toBe(failure);
  expect(journal.requests).toHaveLength(0);
});

it('classifies missing edge content owners without publication', async () => {
  const { journal, patch } = fixture(() => WarpState.empty());
  const receipt = await executeIntentWrite({
    runtime: runtime(), context: context(), intent: intent.edge.clearContent({ from: 'a', to: 'b', label: 'link' }),
    commit: async build => { await build(patch); return await patch.commitWithEvidence(); },
  });
  expect(receipt.outcome.kind).toBe('obstruction');
  expect(journal.requests).toHaveLength(0);
});

it('clears node content using its selected legacy membership without inventing a frontier', async () => {
  const state = WarpState.empty();
  state.nodeAlive.add('n', new Dot('foreign', 1));
  const persistence = createPatchBuilderMockPersistence();
  const journal = createPatchJournal(persistence);
  const patch = createPatchBuilder({
    graphName: 'events', writerId: 'agent-1', evaluationCoordinateRef: 'warp:test-coordinate:events',
    persistence, patchJournal: journal, getCurrentState: () => state,
    versionVector: VersionVector.from({ foreign: 1 }),
  });
  const receipt = await executeIntentWrite({
    runtime: runtime(), context: context(), intent: intent.node.clearContent({ subject: 'n' }),
    commit: async build => { await build(patch); return await patch.commitWithEvidence(); },
  });
  expect(receipt.outcome.kind).toBe('derived');
  expect(journal.requests).toHaveLength(1);
  expect(journal.requests[0]?.patch.observedFrontier).toBeUndefined();
});
