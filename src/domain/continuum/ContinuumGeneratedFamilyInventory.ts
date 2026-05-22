import ContinuumFamilyId, { CONTINUUM_FAMILY_IDS } from './ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyInventoryEntry from './ContinuumGeneratedFamilyInventoryEntry.ts';
import WarpError from '../errors/WarpError.ts';

export type ContinuumGeneratedFamilyInventoryFields = {
  readonly entries: readonly ContinuumGeneratedFamilyInventoryEntry[];
};

/** Complete generated-family readiness inventory for current Continuum families. */
export default class ContinuumGeneratedFamilyInventory {
  readonly entries: readonly ContinuumGeneratedFamilyInventoryEntry[];

  constructor(fields: ContinuumGeneratedFamilyInventoryFields) {
    const checkedFields = requireFields(fields);
    this.entries = freezeAndValidateEntries(checkedFields.entries);
    Object.freeze(this);
  }

  /** Returns the inventory row for a current Continuum family. */
  requireEntry(familyId: string | ContinuumFamilyId): ContinuumGeneratedFamilyInventoryEntry {
    const requested = normalizeFamilyId(familyId);
    const found = this.entries.find((entry) => entry.familyId.equals(requested));
    if (found === undefined) {
      throw new WarpError(`Continuum family ${requested.toString()} is not present in the inventory`, 'E_VALIDATION');
    }
    return found;
  }

  /** Returns the row only when the family is ready for generated-family projection. */
  requireProjectionReady(familyId: string | ContinuumFamilyId): ContinuumGeneratedFamilyInventoryEntry {
    const entry = this.requireEntry(familyId);
    if (!entry.isProjectionReady()) {
      throw new WarpError(
        `Continuum family ${entry.familyId.toString()} is ${entry.status.toString()}, not projection-ready`,
        'E_VALIDATION',
      );
    }
    return entry;
  }
}

/** Validates the inventory constructor envelope. */
function requireFields(
  value: ContinuumGeneratedFamilyInventoryFields | null | undefined,
): ContinuumGeneratedFamilyInventoryFields {
  if (value === null || value === undefined) {
    throw new WarpError('ContinuumGeneratedFamilyInventory fields must be provided', 'E_VALIDATION');
  }
  return value;
}

/** Normalizes a family id carrier. */
function normalizeFamilyId(value: string | ContinuumFamilyId): ContinuumFamilyId {
  if (value instanceof ContinuumFamilyId) {
    return value;
  }
  return new ContinuumFamilyId(value);
}

/** Freezes entries after enforcing a complete one-row-per-family inventory. */
function freezeAndValidateEntries(
  entries: readonly ContinuumGeneratedFamilyInventoryEntry[],
): readonly ContinuumGeneratedFamilyInventoryEntry[] {
  if (!Array.isArray(entries)) {
    throw new WarpError('ContinuumGeneratedFamilyInventory entries must be an array', 'E_VALIDATION');
  }
  const frozenEntries = freezeEntries(entries);
  requireCompleteFamilySet(frozenEntries);
  return frozenEntries;
}

/** Validates entry instances and freezes the inventory row array. */
function freezeEntries(
  entries: readonly ContinuumGeneratedFamilyInventoryEntry[],
): readonly ContinuumGeneratedFamilyInventoryEntry[] {
  const checkedEntries: ContinuumGeneratedFamilyInventoryEntry[] = [];
  for (const entry of entries) {
    if (!(entry instanceof ContinuumGeneratedFamilyInventoryEntry)) {
      throw new WarpError('ContinuumGeneratedFamilyInventory entries must be inventory entries', 'E_VALIDATION');
    }
    checkedEntries.push(entry);
  }
  return Object.freeze(checkedEntries);
}

/** Requires exactly one row for every current Continuum family id. */
function requireCompleteFamilySet(entries: readonly ContinuumGeneratedFamilyInventoryEntry[]): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    const familyId = entry.familyId.toString();
    if (seen.has(familyId)) {
      throw new WarpError(`Continuum generated family inventory duplicates ${familyId}`, 'E_VALIDATION');
    }
    seen.add(familyId);
  }
  for (const familyId of CONTINUUM_FAMILY_IDS) {
    if (!seen.has(familyId)) {
      throw new WarpError(`Continuum generated family inventory is missing ${familyId}`, 'E_VALIDATION');
    }
  }
}
