import ContinuumFamilyId from './ContinuumFamilyId.ts';
import ContinuumGeneratedFamilyStatus from './ContinuumGeneratedFamilyStatus.ts';
import WarpError from '../errors/WarpError.ts';

export type ContinuumGeneratedFamilyInventoryEntryFields = {
  readonly familyId: string | ContinuumFamilyId;
  readonly version: string;
  readonly authoredSchemaPath: string;
  readonly status: string | ContinuumGeneratedFamilyStatus;
  readonly gitWarpSourceFacts: string;
  readonly warpTtdConsumerNeed: string;
  readonly openCut: string;
};

/** One current Continuum-family readiness row for git-warp v18 planning. */
export default class ContinuumGeneratedFamilyInventoryEntry {
  readonly familyId: ContinuumFamilyId;
  readonly version: string;
  readonly authoredSchemaPath: string;
  readonly status: ContinuumGeneratedFamilyStatus;
  readonly gitWarpSourceFacts: string;
  readonly warpTtdConsumerNeed: string;
  readonly openCut: string;

  constructor(fields: ContinuumGeneratedFamilyInventoryEntryFields) {
    const checkedFields = requireFields(fields);
    this.familyId = normalizeFamilyId(checkedFields.familyId);
    this.version = requireNonEmptyString(checkedFields.version, 'version');
    this.authoredSchemaPath = requireNonEmptyString(checkedFields.authoredSchemaPath, 'authoredSchemaPath');
    this.status = normalizeStatus(checkedFields.status);
    this.gitWarpSourceFacts = requireNonEmptyString(checkedFields.gitWarpSourceFacts, 'gitWarpSourceFacts');
    this.warpTtdConsumerNeed = requireNonEmptyString(checkedFields.warpTtdConsumerNeed, 'warpTtdConsumerNeed');
    this.openCut = requireNonEmptyString(checkedFields.openCut, 'openCut');
    Object.freeze(this);
  }

  /** Returns true when this row is safe for generated-family projection work. */
  isProjectionReady(): boolean {
    return this.status.isProjectionReady();
  }
}

/** Validates the entry constructor envelope. */
function requireFields(
  value: ContinuumGeneratedFamilyInventoryEntryFields | null | undefined,
): ContinuumGeneratedFamilyInventoryEntryFields {
  if (value === null || value === undefined) {
    throw new WarpError('ContinuumGeneratedFamilyInventoryEntry fields must be provided', 'E_VALIDATION');
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

/** Normalizes a generated-family status carrier. */
function normalizeStatus(value: string | ContinuumGeneratedFamilyStatus): ContinuumGeneratedFamilyStatus {
  if (value instanceof ContinuumGeneratedFamilyStatus) {
    return value;
  }
  return new ContinuumGeneratedFamilyStatus(value);
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}
