/**
 * Medium: real in-memory runtime/journal, controlled bounded property readings.
 * Oracle: at most four speculative reads, descriptor-order failure, no append
 * before successful guarded admission, and exact captured reading evidence.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import NodePropertyOptic from '../../../../../src/domain/services/optic/NodePropertyOptic.ts';
import NodePropertyOpticReadResult from '../../../../../src/domain/services/optic/NodePropertyOpticReadResult.ts';
import ReadIdentity from '../../../../../src/domain/services/optic/ReadIdentity.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import GitCasIntentStoreAdapter from '../../../../../src/infrastructure/adapters/GitCasIntentStoreAdapter.ts';
import type { PrecommitGuard, WarpIntentDescriptor } from '../../../../../src/domain/types/WarpIntentDescriptor.ts';
import type { PropValue } from '../../../../../src/domain/types/PropValue.ts';
import V17CheckpointTailOpticGraphFixture from '../../../../conformance/fixtures/V17CheckpointTailOpticGraphFixture.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';

function descriptor(guards: readonly PrecommitGuard[]): WarpIntentDescriptor {
  return {
    intentId: 'guarded-batch',
    nutritionLabel: { bundleHash: 'bundle', coreHash: 'core', profile: 'default', budget: 'bounded' },
    precommitGuards: [...guards],
    suffixTransform: { op: 'property.set', payload: { subject: 'n', key: 'role', value: 'admin' } },
  };
}

function status(nodeId: string, expected = 'active'): PrecommitGuard {
  return { op: 'nodeStatus', nodeId, expected, failureTag: `status:${nodeId}:${expected}` };
}

function reading(scope: NodePropertyOptic, value: PropValue | undefined): NodePropertyOpticReadResult {
  const optic = scope.toOptic();
  const nodeId = optic.nodeId();
  const key = optic.propertyKey();
  return new NodePropertyOpticReadResult({
    nodeId, key, value,
    readIdentity: new ReadIdentity({
      worldline: 'guard-batch', entityAspect: `node-property:${nodeId}:${key}`,
      checkpointSha: 'checkpoint:test', checkpointFrontier: [], checkpointIndexShards: [],
      tailWitnesses: [], reducerVersion: 'test-reducer', projectionVersion: 'test-projection',
    }),
  });
}

async function fixture() {
  return (await V17CheckpointTailOpticGraphFixture.openIndexedCheckpoint('guard-batch')).graph;
}

afterEach(() => vi.restoreAllMocks());

describe('bounded precommit guard batches', () => {
  it('starts four bounded readings before awaiting the first and publishes only after all pass', async () => {
    const graph = await fixture();
    const held = Promise.withResolvers<void>();
    const firstStarted = Promise.withResolvers<void>();
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    let active = 0;
    let peak = 0;
    const read = vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      active += 1;
      peak = Math.max(peak, active);
      if (this.toOptic().nodeId() === 'node:0') {
        firstStarted.resolve();
      }
      await held.promise;
      active -= 1;
      return reading(this, 'active');
    });
    const admission = graph.admitIntent(descriptor(Array.from({ length: 9 }, (_, index) => status(`node:${index}`))));
    await firstStarted.promise;
    await Promise.resolve();
    const speculativeCount = read.mock.calls.length;
    expect(publish).not.toHaveBeenCalled();
    held.resolve();
    await expect(admission).resolves.toMatchObject({ outcome: { kind: 'derived' } });
    expect(speculativeCount).toBe(4);
    expect(peak).toBe(4);
    expect(read).toHaveBeenCalledTimes(9);
    expect(publish).toHaveBeenCalledOnce();
  });

  it('reuses one identical property reading while preserving duplicate guard obligations and evidence', async () => {
    const graph = await fixture();
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    const read = vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      return reading(this, 'active');
    });
    const receipt = await graph.admitIntent(descriptor([status('same'), status('same', 'pending')]));
    expect(receipt).toMatchObject({ outcome: { kind: 'obstruction', witness: {
      failedConditionRef: 'warp:intent-guard:condition/status%3Asame%3Apending/same',
      requiredEvidenceRefs: ['warp:intent-guard:required/same/pending'],
      suppliedEvidenceRefs: [
        'warp:intent-guard:actual/same/active',
        'warp:read-identity:{"basis":"checkpointReadBasis+tailWitnesses","checkpointFrontier":[],"checkpointIndexShards":[],"checkpointSha":"checkpoint:test","entityAspect":"node-property:same:status","kind":"checkpoint-tail-read","projectionVersion":"test-projection","reducerVersion":"test-reducer","tailWitnesses":[],"worldline":"guard-batch"}',
      ],
    } } });
    expect(read).toHaveBeenCalledOnce();
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps the first law obstruction ahead of a faster later unexpected rejection', async () => {
    const graph = await fixture();
    const held = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    const startedNodes: string[] = [];
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      startedNodes.push(this.toOptic().nodeId());
      if (this.toOptic().nodeId() === 'first') {
        started.resolve();
        await held.promise;
        return reading(this, 'pending');
      }
      throw new Error('later unexpected failure');
    });
    const admission = graph.admitIntent(descriptor([status('first'), status('later'), status('third'), status('fourth'), status('never')]));
    await started.promise;
    held.resolve();
    await expect(admission).resolves.toMatchObject({ outcome: { kind: 'obstruction', witness: {
      failedConditionRef: 'warp:intent-guard:condition/status%3Afirst%3Aactive/first',
    } } });
    expect(startedNodes).not.toContain('never');
    expect(publish).not.toHaveBeenCalled();
  });

  it('preserves missing-basis refusal through the real property reader without publication', async () => {
    const graph = (await V17CheckpointTailOpticGraphFixture.openEmpty('guard-batch')).graph;
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    await expect(graph.admitIntent(descriptor([status('missing')]))).resolves.toMatchObject({
      outcome: { kind: 'obstruction', witness: { reason: { code: 'git-warp.missing-bounded-basis' } } },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps earlier budget refusal ahead of a later law violation', async () => {
    const graph = await fixture();
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      if (this.toOptic().nodeId() === 'budget') {
        throw new QueryError('bounded read budget', { code: 'E_OPTIC_TAIL_BUDGET_EXCEEDED' });
      }
      return reading(this, 'pending');
    });
    await expect(graph.admitIntent(descriptor([status('budget'), status('later')]))).resolves.toMatchObject({
      outcome: { kind: 'obstruction', witness: { reason: { code: 'git-warp.bounded-read-budget-exceeded' } } },
    });
  });

  it.each([
    new Error('unexpected storage failure'),
    new QueryError('different read failure', { code: 'E_OPTIC_SCHEMA' }),
    'non-Error rejection',
  ])('rethrows an earliest unexpected failure unchanged: %s', async failure => {
    const graph = await fixture();
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockRejectedValue(failure);
    await expect(graph.admitIntent(descriptor([status('first'), status('later')]))).rejects.toBe(failure);
    expect(publish).not.toHaveBeenCalled();
  });

  it('keeps status and assignment readings distinct and accepts a null assignment', async () => {
    const graph = await fixture();
    const keys: string[] = [];
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      const key = this.toOptic().propertyKey();
      keys.push(key);
      return reading(this, key === 'status' ? 'active' : null);
    });
    await expect(graph.admitIntent(descriptor([
      status('same'), { op: 'nodeUnassignedOrSelf', nodeId: 'same', agentId: 'agent-1', failureTag: 'assigned' },
    ]))).resolves.toMatchObject({ outcome: { kind: 'derived' } });
    expect(keys).toEqual(['status', 'agentId']);
  });

  it('does not retain duplicate readings across batches or repeated admissions', async () => {
    const graph = await fixture();
    const read = vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      return reading(this, 'active');
    });
    const repeated = descriptor(Array.from({ length: 5 }, () => status('same')));
    await expect(graph.admitIntent(repeated)).resolves.toMatchObject({ outcome: { kind: 'derived' } });
    await expect(graph.admitIntent(repeated)).resolves.toMatchObject({ outcome: { kind: 'derived' } });
    expect(read).toHaveBeenCalledTimes(4);
  });

  it('preserves the absent-status obstruction and never publishes a partial batch', async () => {
    const graph = await fixture();
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      return reading(this, undefined);
    });
    await expect(graph.admitIntent(descriptor([status('absent'), status('later')]))).resolves.toMatchObject({
      outcome: { kind: 'obstruction', witness: { suppliedEvidenceRefs: [
        'warp:intent-guard:actual/absent/ABSENT', expect.stringContaining('warp:read-identity:'),
      ] } },
    });
    expect(publish).not.toHaveBeenCalled();
  });

  it('uses one real captured basis despite a concurrent writer changing the live frontier', async () => {
    const persistence = new InMemoryGraphAdapter();
    const graph = (await V17CheckpointTailOpticGraphFixture.openEmpty('guard-batch', {
      persistence, writerId: 'reader',
    })).graph;
    await graph.patch(patch => {
      for (const nodeId of ['first', 'second']) {
        patch.addNode(nodeId);
        patch.setProperty(nodeId, 'status', 'active');
      }
    });
    await graph.materialize();
    await graph.createCheckpoint();
    const originalFrontier = await graph.getFrontier();
    const originalTip = originalFrontier.get('reader');
    if (originalTip === undefined) { throw new Error('fixture must have the reader frontier'); }
    const writer = (await V17CheckpointTailOpticGraphFixture.openEmpty('guard-batch', {
      persistence, writerId: 'concurrent',
    })).graph;
    const originalRead = NodePropertyOptic.prototype.read;
    const held = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    const loadBasis = vi.spyOn(graph._checkpointStore, 'loadBasis');
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      if (this.toOptic().nodeId() === 'first') {
        started.resolve();
        await held.promise;
      }
      return await originalRead.call(this);
    });
    const admission = graph.admitIntent(descriptor([status('first'), status('second')]));
    await started.promise;
    const newTip = await writer.patch(patch => { patch.setProperty('first', 'status', 'pending'); });
    held.resolve();
    const receipt = await admission;
    expect(receipt).toMatchObject({ outcome: { kind: 'derived', witness: { evaluation: {
      evaluationCoordinateRef: expect.stringContaining(originalTip),
    } } } });
    expect(loadBasis).toHaveBeenCalledOnce();
    if (receipt.outcome.kind === 'derived') {
      expect(receipt.outcome.witness.evaluation.evaluationCoordinateRef).not.toContain(newTip);
    }
  });

  it('drains speculative reads before returning an earlier obstruction', async () => {
    const graph = await fixture();
    const held = Promise.withResolvers<void>();
    const started = Promise.withResolvers<void>();
    let completed = false;
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      if (this.toOptic().nodeId() === 'held') {
        started.resolve();
        await held.promise;
      }
      return reading(this, 'pending');
    });
    const admission = graph.admitIntent(descriptor([status('first'), status('held')])).then(receipt => {
      completed = true;
      return receipt;
    });
    await Promise.race([started.promise, admission.then(() => undefined)]);
    await Promise.resolve();
    const completedBeforeDrain = completed;
    held.resolve();
    await expect(admission).resolves.toMatchObject({ outcome: { kind: 'obstruction', witness: {
      failedConditionRef: 'warp:intent-guard:condition/status%3Afirst%3Aactive/first',
    } } });
    expect(completedBeforeDrain).toBe(false);
  });

  it('rethrows a later unexpected failure when all preceding guards pass', async () => {
    const graph = await fixture();
    const failure = new Error('later storage failure');
    const publish = vi.spyOn(GitCasIntentStoreAdapter.prototype, 'publish');
    vi.spyOn(NodePropertyOptic.prototype, 'read').mockImplementation(async function (this: NodePropertyOptic) {
      if (this.toOptic().nodeId() === 'later') { throw failure; }
      return reading(this, 'active');
    });
    await expect(graph.admitIntent(descriptor([status('first'), status('later')]))).rejects.toBe(failure);
    expect(publish).not.toHaveBeenCalled();
  });
});
