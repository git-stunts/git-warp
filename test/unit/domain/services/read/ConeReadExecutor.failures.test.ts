import { describe, expect, it } from 'vitest';
import ObserverIdentity from '../../../../../src/domain/api/ObserverIdentity.ts';
import type OpticObservation from '../../../../../src/domain/api/OpticObservation.ts';
import type OpticReading from '../../../../../src/domain/api/OpticReading.ts';
import Purpose from '../../../../../src/domain/api/Purpose.ts';
import ReadBudget from '../../../../../src/domain/api/ReadBudget.ts';
import WarpAccessDenied from '../../../../../src/domain/api/WarpAccessDenied.ts';
import WarpReadGrant from '../../../../../src/domain/api/WarpReadGrant.ts';
import ConeRecordError from '../../../../../src/domain/errors/ConeRecordError.ts';
import ConeStoreUnavailableError from '../../../../../src/domain/errors/ConeStoreUnavailableError.ts';
import PersistenceError from '../../../../../src/domain/errors/PersistenceError.ts';
import SyncError from '../../../../../src/domain/errors/SyncError.ts';
import WarpError from '../../../../../src/domain/errors/WarpError.ts';
import ConeLaneBasis from '../../../../../src/domain/services/cone/ConeLaneBasis.ts';
import type ConeRecordSnapshot from '../../../../../src/domain/services/cone/ConeRecordSnapshot.ts';
import type StoredConeBasis from '../../../../../src/domain/services/cone/StoredConeBasis.ts';
import ConeReadExecutor from '../../../../../src/domain/services/read/ConeReadExecutor.ts';
import WarpAccessPort from '../../../../../src/ports/WarpAccessPort.ts';
import InMemoryConeRecordStore from '../../../../helpers/InMemoryConeRecordStore.ts';
import MemoryConeFeed from '../../../../helpers/MemoryConeFeed.ts';

const REQUEST = {
  observer: ObserverIdentity.of('person', 'reader'), purpose: Purpose.of('todos', 'display', 1),
  budget: null, question: { subject: 'todo', key: null },
};
const GRANT = new WarpReadGrant({ authority: 'reader', budget: ReadBudget.of({ records: 1, bytes: 4096, work: 1 }) });

function access(decision: WarpReadGrant | WarpAccessDenied): WarpAccessPort {
  return new (class extends WarpAccessPort {
    override authorizeRead(): Promise<WarpReadGrant | WarpAccessDenied> { return Promise.resolve(decision); }
    override authorizeWrite(): Promise<WarpAccessDenied> { return Promise.resolve(new WarpAccessDenied('read only')); }
  })();
}

function cone(store: InMemoryConeRecordStore): ConeLaneBasis {
  return ConeLaneBasis.ofLane({ lane: 'graph', store, feed: new MemoryConeFeed('graph') });
}

async function collected(observation: OpticObservation): Promise<OpticReading[]> {
  const readings: OpticReading[] = [];
  for await (const reading of observation) { readings.push(reading); }
  return readings;
}

describe('ConeReadExecutor operational failures', () => {
  it('does not open a cone capability before access grants the read', async () => {
    let openings = 0;
    const openCone = async () => {
      openings += 1;
      return await Promise.resolve(cone(new InMemoryConeRecordStore()));
    };
    const denied = new ConeReadExecutor({ graph: 'graph', access: access(new WarpAccessDenied('denied')), cone: openCone });
    expect((await (await denied.read(REQUEST)).receipt).status).toBe('refused');
    expect(openings).toBe(0);
    const granted = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: openCone });
    expect((await (await granted.read(REQUEST)).receipt).status).toBe('completed');
    expect(openings).toBe(1);
  });

  it('reports a corrupt record by stable code through iteration and receipt-only drain', async () => {
    const store = new (class extends InMemoryConeRecordStore {
      override readRecords(): Promise<ConeRecordSnapshot> {
        return Promise.reject(new ConeRecordError('private storage detail', { code: 'E_CONE_RECORD_CORRUPT' }));
      }
    })();
    const executor = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
    const iterated = await executor.read(REQUEST);
    await expect(collected(iterated)).resolves.toEqual([]);
    const terminal = await iterated.receipt;
    expect(terminal).toMatchObject({ status: 'failed', cause: 'E_CONE_RECORD_CORRUPT', records: 0 });
    expect(await iterated.cancel()).toBe(terminal);
    expect(await (await executor.read(REQUEST)).receipt).toMatchObject({ status: 'failed', cause: 'E_CONE_RECORD_CORRUPT' });
  });

  it('reports corruption while opening the basis as a decided failed observation', async () => {
    const store = new (class extends InMemoryConeRecordStore {
      override readBasis(): Promise<StoredConeBasis | null> {
        return Promise.reject(new ConeRecordError('bad basis', { code: 'E_CONE_RECORD_CORRUPT' }));
      }
    })();
    const executor = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
    const observation = await executor.read(REQUEST);
    expect(await observation.cancel()).toMatchObject({ status: 'failed', cause: 'E_CONE_RECORD_CORRUPT' });
    expect(await collected(observation)).toEqual([]);
  });

  it.each([
    new ConeRecordError('old layout', { code: 'E_CONE_LAYOUT_UNSUPPORTED' }),
    new ConeStoreUnavailableError('read a tree', new Error('locked')),
    new SyncError('invalid patch chain', { code: 'E_SYNC_PATCH_HISTORY' }),
    new PersistenceError('missing blob', PersistenceError.E_MISSING_OBJECT),
    new PersistenceError('missing ref', PersistenceError.E_REF_NOT_FOUND),
    new PersistenceError('ref locked', PersistenceError.E_REF_IO),
  ])('returns a stable failed receipt for recognized $code failures', async (failure) => {
    const store = new (class extends InMemoryConeRecordStore {
      override readRecords(): Promise<ConeRecordSnapshot> { return Promise.reject(failure); }
    })();
    const executor = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
    const observation = await executor.read(REQUEST);
    await expect(collected(observation)).resolves.toEqual([]);
    expect(await observation.receipt).toMatchObject({ status: 'failed', cause: failure.code });
  });

  it.each(['E_SUBSTRATE_VERSION_UNSUPPORTED', 'E_SUBSTRATE_MARKER_MISSING', 'E_SUBSTRATE_MIGRATION_REQUIRED'])(
    'classifies %s only at the lazy-open boundary', async (code) => {
      const failure = new WarpError('unsupported substrate', code);
      const opening = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: () => Promise.reject(failure) });
      const observation = await opening.read(REQUEST);
      expect(await observation.receipt).toMatchObject({ status: 'failed', cause: code });

      const store = new (class extends InMemoryConeRecordStore {
        override readRecords(): Promise<ConeRecordSnapshot> { return Promise.reject(failure); }
      })();
      const reading = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
      await expect(collected(await reading.read(REQUEST))).rejects.toBe(failure);
    },
  );

  it('preserves unexpected failures from opening and advancing a basis', async () => {
    const failure = new ConeRecordError('constructor invariant failed');
    const opening = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: () => Promise.reject(failure) });
    await expect(opening.read(REQUEST)).rejects.toBe(failure);

    const store = new (class extends InMemoryConeRecordStore {
      override readBasis(): Promise<StoredConeBasis | null> { return Promise.reject(failure); }
    })();
    const advancing = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
    await expect(advancing.read(REQUEST)).rejects.toBe(failure);
  });

  it.each([
    new Error('private implementation detail'),
    new ConeRecordError('constructor invariant failed'),
    new WarpError('wrong family despite matching code', 'E_CONE_RECORD_CORRUPT'),
    new SyncError('programming error', { code: 'E_SYNC_INTERNAL' }),
    new PersistenceError('programming error', 'E_INTERNAL'),
  ])('preserves unexpected $name exceptions without copying messages into receipts', async (failure) => {
    const store = new (class extends InMemoryConeRecordStore {
      override readRecords(): Promise<ConeRecordSnapshot> { return Promise.reject(failure); }
    })();
    const executor = new ConeReadExecutor({ graph: 'graph', access: access(GRANT), cone: async () => await Promise.resolve(cone(store)) });
    const observation = await executor.read(REQUEST);
    await expect(collected(observation)).rejects.toBe(failure);
    expect(await observation.receipt).toMatchObject({ status: 'failed', cause: 'observation-failed', records: 0 });
  });
});
