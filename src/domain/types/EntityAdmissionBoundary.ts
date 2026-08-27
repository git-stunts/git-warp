import PatchError from '../errors/PatchError.ts';
import EntityAdmissionOrigin from './EntityAdmissionOrigin.ts';

export type EntityAdmissionBoundaryOptions = Readonly<{
  operationCount: number;
  operationIndex: number;
  origin: EntityAdmissionOrigin;
}>;

/** Persisted operation span that proves one lowered `entity.add` admission. */
export default class EntityAdmissionBoundary {
  readonly operationCount: number;
  readonly operationIndex: number;
  readonly origin: EntityAdmissionOrigin;

  constructor(options: EntityAdmissionBoundaryOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw boundaryError('Entity admission boundary is required');
    }
    this.operationIndex = requireOperationIndex(options.operationIndex);
    this.operationCount = requireOperationCount(options.operationCount);
    if (!(options.origin instanceof EntityAdmissionOrigin)) {
      throw boundaryError('Entity admission boundary requires an allocation origin');
    }
    this.origin = options.origin;
    Object.freeze(this);
  }
}

function requireOperationIndex(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw boundaryError('Entity admission operation index must be a non-negative integer');
  }
  return value;
}

function requireOperationCount(value: number): number {
  if (!Number.isInteger(value) || value < 2) {
    throw boundaryError('Entity admission operation count must include a birth and payload');
  }
  return value;
}

function boundaryError(message: string): PatchError {
  return new PatchError(message, { code: 'E_PATCH_ENTITY_ADMISSION_BOUNDARY' });
}
