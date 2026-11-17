import { describe, expect, it } from 'vitest';
import ObserverIdentity from '../../../../../src/domain/api/ObserverIdentity.ts';
import type OpticObservation from '../../../../../src/domain/api/OpticObservation.ts';
import type OpticReading from '../../../../../src/domain/api/OpticReading.ts';
import Purpose from '../../../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../../../src/domain/api/ReadBudget.ts';
import WarpAccessDenied from '../../../../../src/domain/api/WarpAccessDenied.ts';
import WarpReadGrant from '../../../../../src/domain/api/WarpReadGrant.ts';
import type WarpReadRequest from '../../../../../src/domain/api/WarpReadRequest.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import ConeReadExecutor from '../../../../../src/domain/services/read/ConeReadExecutor.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import WarpAccessPort from '../../../../../src/ports/WarpAccessPort.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

/**
 * Safety Review F1 (#1052): the question that access decides is the question that is
 * answered. A port here grants node presence and refuses every property question.
 */
const OBSERVER = ObserverIdentity.of('person', 'reader');
const PURPOSE = Purpose.of('todos', 'display', 1);
const GRANT = new WarpReadGrant({ authority: 'reader', budget: ReadBudget.of({ records: 1, bytes: 4096, work: 1 }) });
const PRESENCE = { subject: 'todo', key: null, present: true, value: null };

class PresenceOnlyAccess extends WarpAccessPort {
  readonly decided: WarpReadRequest[] = [];

  override authorizeRead(request: WarpReadRequest): Promise<WarpReadGrant | WarpAccessDenied> {
    this.decided.push(request);
    return Promise.resolve(request.question === 'node.presence/v1' ? GRANT : new WarpAccessDenied('presence only'));
  }

  override authorizeWrite(): Promise<WarpAccessDenied> {
    return Promise.resolve(new WarpAccessDenied('read only'));
  }
}

function secretTodo(access: WarpAccessPort): ConeReadExecutor {
  const feed = new MemoryConeFeed('graph');
  feed.append('alice', [new NodeAdd('todo', new Dot('alice', 1)), new NodePropSet('todo', 'ssn', 'secret')]);
  const basis = ConeLaneBasis.ofLane({ lane: 'graph', store: new InMemoryConeRecordStore(), feed });
  return new ConeReadExecutor({ graph: 'graph', access, cone: async () => await Promise.resolve(basis) });
}

async function collected(observation: OpticObservation): Promise<OpticReading[]> {
  const readings: OpticReading[] = [];
  for await (const reading of observation) { readings.push(reading); }
  return readings;
}

describe('ConeReadExecutor answers the question access decided', () => {
  it('answers the decided question even when the caller changes its question object afterwards', async () => {
    const executor = secretTodo(new PresenceOnlyAccess());
    const question: { subject: string; key: string | null } = { subject: 'todo', key: null };
    const observation = await executor.read({ observer: OBSERVER, purpose: PURPOSE, budget: null, question });
    question.key = 'ssn';

    expect(await collected(observation)).toEqual([expect.objectContaining(PRESENCE)]);
    expect(await observation.receipt).toMatchObject({ status: 'completed', question: 'node.presence/v1' });
  });

  it('reads the caller question once, before access decides it', async () => {
    let keyReads = 0;
    const question = {
      subject: 'todo',
      get key(): string | null {
        keyReads += 1;
        return keyReads === 1 ? null : 'ssn';
      },
    };
    const access = new PresenceOnlyAccess();
    const observation = await secretTodo(access).read({ observer: OBSERVER, purpose: PURPOSE, budget: null, question });

    expect(await collected(observation)).toEqual([expect.objectContaining(PRESENCE)]);
    expect(keyReads).toBe(1);
    expect(access.decided).toEqual([expect.objectContaining({ question: 'node.presence/v1', subject: 'todo', key: null })]);
  });

  it('gives the port a frozen request, so the port cannot change the question either', async () => {
    const access = new PresenceOnlyAccess();
    await secretTodo(access).read({ observer: OBSERVER, purpose: PURPOSE, budget: null, question: { subject: 'todo', key: null } });

    expect(access.decided).toHaveLength(1);
    expect(Object.isFrozen(access.decided[0])).toBe(true);
  });
});
