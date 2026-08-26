import WarpError from '../errors/WarpError.ts';
import type { WarpWorldlineCoordinateFrontierEntry } from '../WarpWorldlineCoordinate.ts';

type EntityAdmissionInventoryBasisOptions = Readonly<{
  frontier: ReadonlyMap<string, string>;
  worldlineName: string;
}>;

/** Exact retained-writer frontier for one entity admission inventory. */
export default class EntityAdmissionInventoryBasis {
  readonly frontierEntries: readonly WarpWorldlineCoordinateFrontierEntry[];
  readonly worldlineName: string;

  constructor(options: EntityAdmissionInventoryBasisOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw basisError('Entity admission inventory basis options are required');
    }
    this.worldlineName = requireIdentity(options.worldlineName, 'worldlineName');
    this.frontierEntries = freezeFrontier(options.frontier);
    Object.freeze(this);
  }
}

function freezeFrontier(
  frontier: ReadonlyMap<string, string>,
): readonly WarpWorldlineCoordinateFrontierEntry[] {
  return Object.freeze([...frontier.entries()]
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([writerId, patchSha]) => Object.freeze({
      patchSha: requireIdentity(patchSha, 'patchSha'),
      writerId: requireIdentity(writerId, 'writerId'),
    })));
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function requireIdentity(value: string, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw basisError(`Entity admission inventory basis requires ${field}`);
  }
  return value;
}

function basisError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_BASIS');
}
