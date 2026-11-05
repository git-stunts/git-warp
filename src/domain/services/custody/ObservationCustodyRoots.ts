import ObservationCustodyError from '../../errors/ObservationCustodyError.ts';
import { isObjectId } from './ObservationObjectId.ts';

export type ObservationSupportEntry = { readonly type: 'blob' | 'tree'; readonly oid: string };

/** The physical Git edges one custody page retains: object supports and commit parents. */
export default class ObservationCustodyRoots {
  readonly supports: readonly ObservationSupportEntry[];
  readonly parents: readonly string[];

  constructor(supports: readonly ObservationSupportEntry[], parents: readonly string[]) {
    if (!supports.every(isSupport) || !parents.every(isObjectId)) {
      throw new ObservationCustodyError('Custody roots must name canonical object ids');
    }
    this.supports = Object.freeze(supports.map((entry) => Object.freeze({ type: entry.type, oid: entry.oid })));
    this.parents = Object.freeze([...parents]);
    Object.freeze(this);
  }
}

function isSupport(entry: ObservationSupportEntry): boolean {
  return (entry.type === 'blob' || entry.type === 'tree') && isObjectId(entry.oid);
}
