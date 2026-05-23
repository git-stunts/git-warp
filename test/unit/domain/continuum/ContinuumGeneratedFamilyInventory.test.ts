import { describe, expect, it } from 'vitest';

import ContinuumFamilyId from '../../../../src/domain/continuum/ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyInventory from '../../../../src/domain/continuum/ContinuumGeneratedFamilyInventory.ts';
import ContinuumGeneratedFamilyInventoryEntry from '../../../../src/domain/continuum/ContinuumGeneratedFamilyInventoryEntry.ts';
import ContinuumGeneratedFamilyStatus from '../../../../src/domain/continuum/ContinuumGeneratedFamilyStatus.ts';
import createCurrentContinuumGeneratedFamilyInventory
  from '../../../../src/domain/continuum/createCurrentContinuumGeneratedFamilyInventory.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';

const RECEIPT_SCHEMA_PATH = 'schemas/continuum-receipt-family.graphql';
const SETTLEMENT_SCHEMA_PATH = 'schemas/continuum-settlement-family.graphql';
const NEIGHBORHOOD_SCHEMA_PATH = 'schemas/continuum-neighborhood-core-family.graphql';
const RUNTIME_BOUNDARY_SCHEMA_PATH = 'schemas/continuum-runtime-boundary-family.graphql';

function makeEntry(fields: {
  readonly familyId: string;
  readonly authoredSchemaPath: string;
  readonly status?: string;
}): ContinuumGeneratedFamilyInventoryEntry {
  return new ContinuumGeneratedFamilyInventoryEntry({
    familyId: fields.familyId,
    version: '0.1.0',
    authoredSchemaPath: fields.authoredSchemaPath,
    status: fields.status ?? 'profiled-fixture-witnessed',
    gitWarpSourceFacts: 'test source facts',
    warpTtdConsumerNeed: 'test consumer need',
    openCut: 'test open cut',
  });
}

function makeCompleteEntries(): readonly ContinuumGeneratedFamilyInventoryEntry[] {
  return Object.freeze([
    makeEntry({ familyId: 'receipt-family', authoredSchemaPath: RECEIPT_SCHEMA_PATH }),
    makeEntry({ familyId: 'settlement-family', authoredSchemaPath: SETTLEMENT_SCHEMA_PATH }),
    makeEntry({
      familyId: 'neighborhood-core-family',
      authoredSchemaPath: NEIGHBORHOOD_SCHEMA_PATH,
      status: 'authored-only',
    }),
    makeEntry({
      familyId: 'runtime-boundary-family',
      authoredSchemaPath: RUNTIME_BOUNDARY_SCHEMA_PATH,
      status: 'authored-only',
    }),
  ]);
}

describe('ContinuumGeneratedFamilyInventory', () => {
  it('records current v18 generated-family readiness for every Continuum family', () => {
    const inventory = createCurrentContinuumGeneratedFamilyInventory();

    expect(inventory.entries.map((entry) => entry.familyId.toString())).toEqual([
      'receipt-family',
      'settlement-family',
      'neighborhood-core-family',
      'runtime-boundary-family',
    ]);
    expect(inventory.requireEntry('receipt-family').status.isProjectionReady()).toBe(true);
    expect(inventory.requireEntry('settlement-family').status.isProjectionReady()).toBe(true);
    expect(inventory.requireEntry('neighborhood-core-family').status.isProjectionReady()).toBe(false);
    expect(inventory.requireEntry('runtime-boundary-family').status.isProjectionReady()).toBe(false);
  });

  it('requires projection-ready status before later slices emit source facts', () => {
    const inventory = createCurrentContinuumGeneratedFamilyInventory();

    expect(inventory.requireProjectionReady('receipt-family').familyId.toString()).toBe('receipt-family');
    expect(inventory.requireProjectionReady(new ContinuumFamilyId('settlement-family')).familyId.toString())
      .toBe('settlement-family');
    expect(() => inventory.requireProjectionReady('runtime-boundary-family')).toThrow(WarpError);
  });

  it('classifies authored-only generated-family status explicitly', () => {
    const authoredOnly = new ContinuumGeneratedFamilyStatus('authored-only');
    const profiled = new ContinuumGeneratedFamilyStatus('profiled-fixture-witnessed');

    expect(authoredOnly.isAuthoredOnly()).toBe(true);
    expect(authoredOnly.isProjectionReady()).toBe(false);
    expect(profiled.isAuthoredOnly()).toBe(false);
    expect(profiled.isProjectionReady()).toBe(true);
  });

  it('rejects unknown family lookups before returning an inventory row', () => {
    const inventory = createCurrentContinuumGeneratedFamilyInventory();

    expect(() => inventory.requireEntry('not-a-continuum-family')).toThrow(WarpError);
  });

  it('rejects inventories that are missing current Continuum families', () => {
    const entries = makeCompleteEntries().filter((entry) => entry.familyId.toString() !== 'runtime-boundary-family');

    expect(() => new ContinuumGeneratedFamilyInventory({ entries })).toThrow(WarpError);
  });

  it('rejects duplicate family entries', () => {
    const entries = Object.freeze([
      ...makeCompleteEntries(),
      makeEntry({ familyId: 'receipt-family', authoredSchemaPath: RECEIPT_SCHEMA_PATH }),
    ]);

    expect(() => new ContinuumGeneratedFamilyInventory({ entries })).toThrow(WarpError);
  });

  it('rejects invalid status and blank evidence fields', () => {
    expect(() => new ContinuumGeneratedFamilyStatus('not-ready')).toThrow(WarpError);
    expect(() => new ContinuumGeneratedFamilyInventoryEntry({
      familyId: 'receipt-family',
      version: '0.1.0',
      authoredSchemaPath: '',
      status: 'profiled-fixture-witnessed',
      gitWarpSourceFacts: 'test source facts',
      warpTtdConsumerNeed: 'test consumer need',
      openCut: 'test open cut',
    })).toThrow(WarpError);

    expect(() => new ContinuumGeneratedFamilyInventoryEntry({
      familyId: 'receipt-family',
      version: '0.1.0',
      authoredSchemaPath: '   ',
      status: 'profiled-fixture-witnessed',
      gitWarpSourceFacts: 'test source facts',
      warpTtdConsumerNeed: 'test consumer need',
      openCut: 'test open cut',
    })).toThrow(WarpError);
  });
});
