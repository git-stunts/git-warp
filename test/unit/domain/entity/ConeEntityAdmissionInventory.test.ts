import { describe, expect, it } from 'vitest';
import type PatchEntry from '../../../../src/domain/artifacts/PatchEntry.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import ConeEntityAdmissionInventory, {
  ENTITY_ADMISSION_INVENTORY_PAGE,
} from '../../../../src/domain/entity/ConeEntityAdmissionInventory.ts';
import EntityAdmissionInventoryBasis from '../../../../src/domain/entity/EntityAdmissionInventoryBasis.ts';
import { entityAdmissionsFromPatch } from '../../../../src/domain/entity/EntityAdmissionPatchReader.ts';
import { recordedEntityAdmission } from '../../../../src/domain/entity/RecordedEntityAdmission.ts';
import type RetainedEntityAdmission from '../../../../src/domain/entity/RetainedEntityAdmission.ts';
import ConeAdmissionRecord from '../../../../src/domain/services/cone/ConeAdmissionRecord.ts';
import ConeAdmissionTally from '../../../../src/domain/services/cone/ConeAdmissionTally.ts';
import ConeFold from '../../../../src/domain/services/cone/ConeFold.ts';
import ConeFoldSession from '../../../../src/domain/services/cone/ConeFoldSession.ts';
import ConeReader from '../../../../src/domain/services/cone/ConeReader.ts';
import ConeRecordKey from '../../../../src/domain/services/cone/ConeRecordKey.ts';
import ConeRoot from '../../../../src/domain/services/cone/ConeRoot.ts';
import ConeUnprovenAdmissionRecord from '../../../../src/domain/services/cone/ConeUnprovenAdmissionRecord.ts';
import EntityAdmissionOrigin from '../../../../src/domain/types/EntityAdmissionOrigin.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import PatchEntryClass from '../../../../src/domain/artifacts/PatchEntry.ts';
import { EventId } from '../../../../src/domain/utils/EventId.ts';
import { admissionPatch, unmarkedEntityPatch } from '../../../helpers/entityAdmissionPatches.ts';
import InMemoryConeRecordStore from '../../../helpers/InMemoryConeRecordStore.ts';

let shas = 0;
function sha(): string {
  shas += 1;
  return shas.toString(16).padStart(40, '0');
}

async function folded(store: InMemoryConeRecordStore, entries: readonly PatchEntry[]): Promise<ConeRoot> {
  const session = new ConeFoldSession({ store, root: ConeRoot.empty() });
  for (const entry of entries) {
    await ConeFold.fold(session, entry);
  }
  return await session.commit();
}

function basisOf(root: ConeRoot, writers: readonly string[]): EntityAdmissionInventoryBasis {
  return new EntityAdmissionInventoryBasis({
    frontier: new Map(writers.map((writerId) => [writerId, 'f'.repeat(40)])), root, worldlineName: 'captures',
  });
}

async function drain(inventory: ConeEntityAdmissionInventory, basis: EntityAdmissionInventoryBasis): Promise<RetainedEntityAdmission[]> {
  const merge = await inventory.open(basis, null);
  const admissions: RetainedEntityAdmission[] = [];
  for (let next = await merge.next(); next !== null; next = await merge.next()) {
    admissions.push(next);
  }
  return admissions;
}

/** What a scan of every writer's history from its tip produced: descending deterministic event order. */
function scanned(entries: readonly PatchEntry[]): RetainedEntityAdmission[] {
  return entries.flatMap((entry) => [...entityAdmissionsFromPatch(entry)]).sort((left, right) => right.compare(left));
}

function twoWriterHistory(): PatchEntry[] {
  return [
    admissionPatch({ writer: 'alice', lamport: 1, sha: sha(), entities: [{ subject: 'a1' }, { namespace: 'cards' }], firstCounter: 1 }),
    admissionPatch({ writer: 'bob', lamport: 2, sha: sha(), entities: [{ subject: 'b1' }], firstCounter: 1, context: { alice: 2 } }),
    new PatchEntryClass({ patch: new Patch({ writer: 'alice', lamport: 3, context: {}, ops: [new NodeAdd('plain', new Dot('alice', 3))], entityAdmissions: [] }), sha: sha() }),
    admissionPatch({ writer: 'alice', lamport: 4, sha: sha(), entities: [{ subject: 'a2' }], firstCounter: 4 }),
    admissionPatch({ writer: 'bob', lamport: 4, sha: sha(), entities: [{ namespace: 'cards' }, { subject: 'b2' }], firstCounter: 2 }),
  ];
}

describe('cone entity admission index (#1039)', () => {
  it('appends each patch admissions to its writer chain after the tally, and nothing for other patches', async () => {
    const store = new InMemoryConeRecordStore();
    const history = twoWriterHistory();
    const root = await folded(store, history);
    const reader = new ConeReader(store);
    const tallies = await reader.records(root, [ConeRecordKey.forAdmissionTally('alice'), ConeRecordKey.forAdmissionTally('bob')]);
    expect(tallies.admissionTally('alice')).toEqual(new ConeAdmissionTally({ writerId: 'alice', count: 3 }));
    expect(tallies.admissionTally('bob').count).toBe(3);
    expect(tallies.admissionTally('carol')).toEqual(ConeAdmissionTally.empty('carol'));
    const entry = (await reader.records(root, [ConeRecordKey.forAdmission('alice', 2)])).admission('alice', 2);
    expect(entry).toBeInstanceOf(ConeAdmissionRecord);
    expect(entry instanceof ConeAdmissionRecord ? entry.admission.subject : null).toBe('a2');
    expect((await reader.records(root, [])).admission('alice', 9)).toBeNull();
  });

  it('answers exactly what a scan of every history answered, in descending event order, across pages', async () => {
    const store = new InMemoryConeRecordStore();
    const history = twoWriterHistory();
    const root = await folded(store, history);
    const expected = scanned(history);
    for (const page of [1, 2, ENTITY_ADMISSION_INVENTORY_PAGE]) {
      const inventory = new ConeEntityAdmissionInventory({ reader: new ConeReader(store), page });
      const admissions = await drain(inventory, basisOf(root, ['alice', 'bob']));
      expect(admissions).toEqual(expected);
      expect(admissions.map(({ subject }) => subject).slice(0, 2)).toContain('b2');
    }
  });

  it('resumes from the positions a merge reports, and refuses positions ahead of the basis', async () => {
    const store = new InMemoryConeRecordStore();
    const history = twoWriterHistory();
    const root = await folded(store, history);
    const inventory = new ConeEntityAdmissionInventory({ reader: new ConeReader(store), page: 2 });
    const basis = basisOf(root, ['alice', 'bob']);
    const first = await inventory.open(basis, null);
    const head = [await first.next(), await first.next()];
    const resumed = await inventory.open(basis, first.positions());
    const rest: Array<RetainedEntityAdmission | null> = [];
    for (let next = await resumed.next(); next !== null; next = await resumed.next()) {
      rest.push(next);
    }
    expect([...head, ...rest]).toEqual(scanned(history));
    expect(resumed.positions()).toEqual(new Map([['alice', 0], ['bob', 0]]));
    await expect(inventory.open(basis, new Map([['alice', 4]]))).rejects.toMatchObject({ code: 'E_ENTITY_ADMISSION_INVENTORY_CURSOR' });
    expect(() => new ConeEntityAdmissionInventory({ reader: new ConeReader(store), page: 0 }))
      .toThrowError(expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_PAGE' }));
  });

  it('indexes an unprovable patch as a refusal that an inventory meets where a history scan did', async () => {
    const store = new InMemoryConeRecordStore();
    const older = admissionPatch({ writer: 'alice', lamport: 1, sha: sha(), entities: [{ subject: 'old' }], firstCounter: 1 });
    const legacy = unmarkedEntityPatch({ writer: 'alice', lamport: 2, sha: sha(), counter: 2 });
    const newer = admissionPatch({ writer: 'alice', lamport: 3, sha: sha(), entities: [{ subject: 'new' }], firstCounter: 3 });
    const root = await folded(store, [older, legacy, newer]);
    const marker = (await new ConeReader(store).records(root, [ConeRecordKey.forAdmission('alice', 1)])).admission('alice', 1);
    expect(marker).toBeInstanceOf(ConeUnprovenAdmissionRecord);
    const inventory = new ConeEntityAdmissionInventory({ reader: new ConeReader(store), page: 8 });
    const merge = await inventory.open(basisOf(root, ['alice']), null);
    expect((await merge.next())?.subject).toBe('new');
    await expect(merge.next()).rejects.toMatchObject({ code: 'E_ENTITY_ADMISSION_INVENTORY_LEGACY_AMBIGUOUS' });
    const atLegacy = await folded(store, [legacy]);
    await expect(inventory.open(basisOf(atLegacy, ['alice']), null))
      .rejects.toMatchObject({ code: 'E_ENTITY_ADMISSION_INVENTORY_LEGACY_AMBIGUOUS' });
  });

  it('reports a corrupt index whose tally names an entry that is not stored', async () => {
    const store = new InMemoryConeRecordStore();
    const root = await store.writeRecords(ConeRoot.empty(), [new ConeAdmissionTally({ writerId: 'alice', count: 1 })]);
    const inventory = new ConeEntityAdmissionInventory({ reader: new ConeReader(store) });
    await expect(inventory.open(basisOf(root, ['alice']), null)).rejects.toMatchObject({ code: 'E_CONE_RECORD_CORRUPT' });
  });

  it('validates admission records and rebuilds recorded admissions as retained ones', () => {
    const admission = recordedEntityAdmission({
      context: VersionVector.from({ alice: 1 }),
      dot: new Dot('alice', 1),
      eventId: new EventId(1, 'alice', 'a'.repeat(40), 0),
      origin: EntityAdmissionOrigin.legacyUnrecorded(),
      properties: { body: 'x' },
      subject: 'capture:1',
    });
    expect(admission.properties).toEqual({ body: 'x' });
    expect(new ConeAdmissionRecord({ writerId: 'alice', ordinal: 0, admission }).key())
      .toEqual(ConeRecordKey.forAdmission('alice', 0));
    expect(() => new ConeAdmissionRecord({ writerId: 'bob', ordinal: 0, admission })).toThrow('own writer chain');
    expect(new ConeAdmissionTally({ writerId: 'alice', count: 1 }).equals(ConeAdmissionTally.empty('alice').advancedBy(1))).toBe(true);
    expect(ConeAdmissionTally.empty('alice').equals(ConeAdmissionTally.empty('bob'))).toBe(false);
    const unproven = new ConeUnprovenAdmissionRecord({ writerId: 'alice', ordinal: 2, patchSha: 'b'.repeat(40), code: 'E_X', message: 'no proof' });
    expect(unproven.key()).toEqual(ConeRecordKey.forAdmission('alice', 2));
    expect(unproven.refusal()).toMatchObject({ code: 'E_X', message: 'no proof', context: { writerId: 'alice', ordinal: 2 } });
  });
});
