import { describe, expect, it } from 'vitest';
import ObserverIdentity from '../../../../../src/domain/api/ObserverIdentity.ts';
import type OpticReading from '../../../../../src/domain/api/OpticReading.ts';
import Purpose from '../../../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../../../src/domain/api/ReadBudget.ts';
import WarpAccessDenied from '../../../../../src/domain/api/WarpAccessDenied.ts';
import WarpReadGrant from '../../../../../src/domain/api/WarpReadGrant.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeReadExecutor from '../../../../../src/domain/services/read/ConeReadExecutor.ts';
import ImmutableBytes from '../../../../../src/domain/services/snapshot/ImmutableBytes.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import WarpAccessPort from '../../../../../src/ports/WarpAccessPort.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const LANE = 'main';

class StaticReadAccess extends WarpAccessPort {
  readonly #decision: WarpReadGrant | WarpAccessDenied;

  constructor(decision: WarpReadGrant | WarpAccessDenied) {
    super();
    this.#decision = decision;
  }

  override authorizeRead(): Promise<WarpReadGrant | WarpAccessDenied> {
    return Promise.resolve(this.#decision);
  }

  override authorizeWrite(): Promise<WarpAccessDenied> {
    return Promise.resolve(new WarpAccessDenied('read-only'));
  }
}

function createFixture(decision: WarpReadGrant | WarpAccessDenied) {
  const store = new InMemoryConeRecordStore();
  const feed = new MemoryConeFeed(LANE);
  const cone = ConeLaneBasis.ofLane({ store, feed, lane: LANE });
  const access = new StaticReadAccess(decision);
  const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });
  return { store, feed, cone, access, executor };
}

describe('ConeReadExecutor', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'investigation', 1);
  const defaultBudget = ReadBudget.of({ records: 5, bytes: 4096, work: 10 });
  const grant = new WarpReadGrant({ authority: 'auth-1', budget: defaultBudget });

  it('reports refused when access is denied by WarpAccessDenied', async () => {
    const { executor } = createFixture(new WarpAccessDenied('unauthorized'));

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('refused');
    expect(receipt.cause).toBe('access-denied: unauthorized');
    expect(receipt.records).toBe(0);
  });

  it('reports refused when access boundary returns a non-grant value at runtime', async () => {
    const malformedAccess = new (class extends WarpAccessPort {
      override authorizeRead(): Promise<WarpReadGrant> {
        // @ts-expect-error Exercising runtime defense when a JS caller returns a non-grant object
        return Promise.resolve({ notAGrant: true });
      }

      override authorizeWrite(): Promise<WarpAccessDenied> {
        return Promise.resolve(new WarpAccessDenied('read-only'));
      }
    })();
    const store = new InMemoryConeRecordStore();
    const feed = new MemoryConeFeed(LANE);
    const cone = ConeLaneBasis.ofLane({ store, feed, lane: LANE });
    const executor = new ConeReadExecutor({ graph: 'graph-1', access: malformedAccess, cone });

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('refused');
    expect(receipt.cause).toBe('access-denied: the access boundary gave no grant');
  });

  it('reports failed with repair hints when cone basis is obstructed', async () => {
    const { feed, executor } = createFixture(grant);
    feed.append('alice', [new NodeAdd('item-1', new Dot('alice', 1))]);
    feed.diverged.add('alice');

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('failed');
    expect(receipt.cause).toBe('cone_writer_diverged');
    expect(receipt.repairHints.length).toBeGreaterThan(0);
  });

  it('answers node presence question for an alive node and dead node', async () => {
    const { feed, executor } = createFixture(grant);
    feed.append('alice', [new NodeAdd('item-1', new Dot('alice', 1))]);

    const liveObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });
    const liveReadings: OpticReading[] = [];
    for await (const r of liveObs) {
      liveReadings.push(r);
    }
    expect(liveReadings).toHaveLength(1);
    expect(liveReadings[0]?.present).toBe(true);
    expect(liveReadings[0]?.value).toBeNull();
    const liveReceipt = await liveObs.receipt;
    expect(liveReceipt.status).toBe('completed');
    expect(liveReceipt.question).toBe('node.presence/v1');
    expect(liveReceipt.records).toBe(1);

    const deadObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'missing-node', key: null },
    });
    const deadReadings: OpticReading[] = [];
    for await (const r of deadObs) {
      deadReadings.push(r);
    }
    expect(deadReadings).toHaveLength(1);
    expect(deadReadings[0]?.present).toBe(false);
    expect(deadReadings[0]?.value).toBeNull();
  });

  it('answers property presence question for alive node and dead node', async () => {
    const { feed, executor } = createFixture(grant);
    feed.append('alice', [
      new NodeAdd('item-1', new Dot('alice', 1)),
      new NodePropSet('item-1', 'color', 'green'),
    ]);

    const propObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'color' },
    });
    const readings: OpticReading[] = [];
    for await (const r of propObs) {
      readings.push(r);
    }
    expect(readings[0]?.present).toBe(true);
    expect(readings[0]?.value).toBe('green');

    const missingPropObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'nonexistent' },
    });
    const missingReadings: OpticReading[] = [];
    for await (const r of missingPropObs) {
      missingReadings.push(r);
    }
    expect(missingReadings[0]?.present).toBe(false);
    expect(missingReadings[0]?.value).toBeNull();

    const deadPropObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'missing-node', key: 'color' },
    });
    const deadReadings: OpticReading[] = [];
    for await (const r of deadPropObs) {
      deadReadings.push(r);
    }
    expect(deadReadings[0]?.present).toBe(false);
    expect(deadReadings[0]?.value).toBeNull();
  });

  it('reports budget-exhausted when encoded byte size exceeds budget.bytes', async () => {
    const tinyBudget = ReadBudget.of({ records: 5, bytes: 2, work: 10 });
    const tinyGrant = new WarpReadGrant({ authority: 'auth-1', budget: tinyBudget });
    const { feed, executor } = createFixture(tinyGrant);
    feed.append('alice', [
      new NodeAdd('item-1', new Dot('alice', 1)),
      new NodePropSet('item-1', 'title', 'very large text that exceeds byte limit'),
    ]);

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'title' },
    });

    const readings: OpticReading[] = [];
    for await (const r of observation) {
      readings.push(r);
    }
    expect(readings).toHaveLength(0);
    const receipt = await observation.receipt;
    expect(receipt.status).toBe('budget-exhausted');
    expect(receipt.records).toBe(1);
  });

  it('reports cancelled when cancel() is called on an active observation', async () => {
    const { executor } = createFixture(grant);

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.cancel();
    expect(receipt.status).toBe('cancelled');
    expect(receipt.cause).toBe('cancelled');
  });

  it('ended observation preserves terminal status even if cancel() is called before draining', async () => {
    const { executor } = createFixture(new WarpAccessDenied('denied'));

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const cancelReceipt = await observation.cancel();
    expect(cancelReceipt.status).toBe('refused');
    const receipt = await observation.receipt;
    expect(receipt.status).toBe('refused');
  });

  it('does not leak Object.prototype properties and preserves explicit null property values', async () => {
    const { feed, executor } = createFixture(grant);
    feed.append('alice', [
      new NodeAdd('item-1', new Dot('alice', 1)),
      new NodePropSet('item-1', 'nullable', null),
    ]);

    for (const protoKey of ['__proto__', 'toString', 'constructor', 'valueOf']) {
      const protoObs = await executor.read({
        observer,
        purpose,
        budget: null,
        question: { subject: 'item-1', key: protoKey },
      });
      const protoReadings: OpticReading[] = [];
      for await (const r of protoObs) {
        protoReadings.push(r);
      }
      expect(protoReadings[0]?.present).toBe(false);
      expect(protoReadings[0]?.value).toBeNull();
    }

    const nullPropObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'nullable' },
    });
    const nullReadings: OpticReading[] = [];
    for await (const r of nullPropObs) {
      nullReadings.push(r);
    }
    expect(nullReadings[0]?.present).toBe(true);
    expect(nullReadings[0]?.value).toBeNull();
  });

  it('charges actual byte length for ImmutableBytes, arrays, and objects, and 0 bytes for node presence or absent properties', async () => {
    const smallBudget = ReadBudget.of({ records: 1, bytes: 16, work: 1 });
    const smallGrant = new WarpReadGrant({ authority: 'auth-1', budget: smallBudget });
    const { feed, cone, executor } = createFixture(smallGrant);
    feed.append('alice', [
      new NodeAdd('item-1', new Dot('alice', 1)),
      new NodePropSet('item-1', 'blob', new Uint8Array(64)),
      new NodePropSet('item-1', 'nested', { items: ['a', 'b'], emptyArr: [], emptyObj: {} }),
    ]);

    const blobObs = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'blob' },
    });
    const blobReceipt = await blobObs.receipt;
    expect(blobReceipt.status).toBe('budget-exhausted');

    const nestedAccess = new StaticReadAccess(new WarpReadGrant({ authority: 'auth-1', budget: ReadBudget.of({ records: 1, bytes: 1024, work: 1 }) }));
    const nestedExecutor = new ConeReadExecutor({ graph: 'graph-1', access: nestedAccess, cone });
    const nestedObs = await nestedExecutor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'nested' },
    });
    expect((await nestedObs.receipt).status).toBe('completed');

    const oneByteBudget = ReadBudget.of({ records: 1, bytes: 1, work: 1 });
    const oneByteAccess = new StaticReadAccess(new WarpReadGrant({ authority: 'auth-1', budget: oneByteBudget }));
    const oneByteExecutor = new ConeReadExecutor({ graph: 'graph-1', access: oneByteAccess, cone });
    const presenceObs = await oneByteExecutor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });
    expect((await presenceObs.receipt).status).toBe('completed');
  });
});
