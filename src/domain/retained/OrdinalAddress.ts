import RetainedGraphError from '../errors/RetainedGraphError.ts';
import ConeRecordKey from '../services/cone/ConeRecordKey.ts';
import GraphOrdinal from './GraphOrdinal.ts';

/**
 * A typed payload reference (#815): the element record an ordinal addresses.
 * A node ordinal addresses a node record and an edge ordinal an edge record;
 * any other pairing fails closed. Constructing an address reads nothing;
 * the record is opened only by a caller that asks for it.
 */
export default class OrdinalAddress {
  readonly ordinal: GraphOrdinal;
  readonly record: ConeRecordKey;

  constructor(ordinal: GraphOrdinal, record: ConeRecordKey) {
    if (!(ordinal instanceof GraphOrdinal) || !(record instanceof ConeRecordKey) || record.family !== ordinal.kind) {
      throw new RetainedGraphError('Ordinal address must name a record of its own kind', 'E_RETAINED_ADDRESS_KIND_MISMATCH', {
        context: { ordinal: String(ordinal), record: String(record) },
      });
    }
    this.ordinal = ordinal;
    this.record = record;
    Object.freeze(this);
  }

  equals(other: OrdinalAddress): boolean {
    return other.ordinal.equals(this.ordinal) && other.record.equals(this.record);
  }
}
