import { describe, expect, it, vi } from 'vitest';
import ObserverIdentity from '../../../../../src/domain/api/ObserverIdentity.ts';
import type OpticReading from '../../../../../src/domain/api/OpticReading.ts';
import Purpose from '../../../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../../../src/domain/api/ReadBudget.ts';
import WarpAccessDenied from '../../../../../src/domain/api/WarpAccessDenied.ts';
import WarpReadGrant from '../../../../../src/domain/api/WarpReadGrant.ts';
import { LWWRegister } from '../../../../../src/domain/crdt/LWW.ts';
import ConeBasis from '../../../../../src/domain/services/cone/ConeBasis.ts';
import ConeContendedObstruction from '../../../../../src/domain/services/cone/ConeContendedObstruction.ts';
import type ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeNodeRecord from '../../../../../src/domain/services/cone/ConeNodeRecord.ts';
import ConeReadExecutor from '../../../../../src/domain/services/read/ConeReadExecutor.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';
import type WarpAccessPort from '../../../../../src/ports/WarpAccessPort.ts';

describe('ConeReadExecutor', () => {
  const observer = ObserverIdentity.of('audit', 'agent-1');
  const purpose = Purpose.of('audit', 'investigation', 1);
  const defaultBudget = ReadBudget.of({ records: 5, bytes: 4096, work: 10 });
  const grant = new WarpReadGrant({ authority: 'auth-1', budget: defaultBudget });
  const eventId = new EventId(1, 'alice', 'deadbeef00000000000000000000000000000000', 0);

  function makeMockAccess(decision: WarpReadGrant | WarpAccessDenied): WarpAccessPort {
    return {
      authorizeRead: vi.fn().mockResolvedValue(decision),
      authorizeWrite: vi.fn(),
    };
  }

  function makeMockCone(basisOrObstruction: ConeBasis | ConeContendedObstruction, nodeRecord = ConeNodeRecord.empty('item-1')): ConeLaneBasis {
    return {
      lane: 'main',
      advance: vi.fn().mockResolvedValue(basisOrObstruction),
      reader: {
        node: vi.fn().mockResolvedValue(nodeRecord),
      },
    } as unknown as ConeLaneBasis;
  }

  it('reports refused when access is denied by WarpAccessDenied', async () => {
    const access = makeMockAccess(new WarpAccessDenied('unauthorized'));
    const cone = makeMockCone(ConeBasis.empty());
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

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

  it('reports refused when access boundary gives an unexpected response', async () => {
    const access = {
      authorizeRead: vi.fn().mockResolvedValue({ notAGrant: true }),
      authorizeWrite: vi.fn(),
    } as unknown as WarpAccessPort;
    const cone = makeMockCone(ConeBasis.empty());
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

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

  it('reports budget-exhausted when granted record limit is less than 1', async () => {
    const zeroRecordGrant = Object.create(WarpReadGrant.prototype) as WarpReadGrant;
    Object.assign(zeroRecordGrant, { authority: 'auth-1', budget: { records: 0, bytes: 1024, work: 10 } });
    const access = makeMockAccess(zeroRecordGrant);
    const cone = makeMockCone(ConeBasis.empty());
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('budget-exhausted');
    expect(receipt.records).toBe(0);
  });

  it('reports failed with repair hints when cone basis is obstructed', async () => {
    const access = makeMockAccess(grant);
    const obstruction = new ConeContendedObstruction('main', 3);
    const cone = makeMockCone(obstruction);
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('failed');
    expect(receipt.cause).toBe('cone_contended');
    expect(receipt.repairHints.length).toBeGreaterThan(0);
    expect(receipt.repairHints[0]?.code).toBe('retry_cone_advance');
  });

  it('answers node presence question for an alive node and dead node', async () => {
    const access = makeMockAccess(grant);
    const liveRecord = new ConeNodeRecord({
      nodeId: 'item-1',
      addDots: new Set(['alice:1']),
      tombstones: new Set(),
      birth: eventId,
      clear: null,
      props: new Map(),
      outDegree: 0,
      inDegree: 0,
    });
    const cone = makeMockCone(ConeBasis.empty(), liveRecord);
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

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

    // Test dead node
    const deadCone = makeMockCone(ConeBasis.empty(), ConeNodeRecord.empty('item-1'));
    const deadExecutor = new ConeReadExecutor({ graph: 'graph-1', access, cone: deadCone });
    const deadObs = await deadExecutor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });
    const deadReadings: OpticReading[] = [];
    for await (const r of deadObs) {
      deadReadings.push(r);
    }
    expect(deadReadings).toHaveLength(1);
    expect(deadReadings[0]?.present).toBe(false);
  });

  it('answers property presence question for alive node and dead node', async () => {
    const access = makeMockAccess(grant);
    const liveRecordWithProp = new ConeNodeRecord({
      nodeId: 'item-1',
      addDots: new Set(['alice:1']),
      tombstones: new Set(),
      birth: eventId,
      clear: null,
      props: new Map([
        ['color', new LWWRegister(eventId, 'green')],
      ]),
      outDegree: 0,
      inDegree: 0,
    });
    const cone = makeMockCone(ConeBasis.empty(), liveRecordWithProp);
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

    // Existing property
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

    // Missing property on live node
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

    // Property on dead node
    const deadCone = makeMockCone(ConeBasis.empty(), ConeNodeRecord.empty('item-1'));
    const deadExecutor = new ConeReadExecutor({ graph: 'graph-1', access, cone: deadCone });
    const deadPropObs = await deadExecutor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: 'color' },
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
    const access = makeMockAccess(tinyGrant);
    const liveRecordWithProp = new ConeNodeRecord({
      nodeId: 'item-1',
      addDots: new Set(['alice:1']),
      tombstones: new Set(),
      birth: eventId,
      clear: null,
      props: new Map([
        ['title', new LWWRegister(eventId, 'very large text that exceeds byte limit')],
      ]),
      outDegree: 0,
      inDegree: 0,
    });
    const cone = makeMockCone(ConeBasis.empty(), liveRecordWithProp);
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

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
    const access = makeMockAccess(grant);
    const cone = makeMockCone(ConeBasis.empty());
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

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

  it('ended observation preserves terminal status once drained', async () => {
    const access = makeMockAccess(new WarpAccessDenied('denied'));
    const cone = makeMockCone(ConeBasis.empty());
    const executor = new ConeReadExecutor({ graph: 'graph-1', access, cone });

    const observation = await executor.read({
      observer,
      purpose,
      budget: null,
      question: { subject: 'item-1', key: null },
    });

    const receipt = await observation.receipt;
    expect(receipt.status).toBe('refused');
    const cancelReceipt = await observation.cancel();
    expect(cancelReceipt.status).toBe('refused');
  });
});
