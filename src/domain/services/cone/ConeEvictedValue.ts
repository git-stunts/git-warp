import ConeRecordError from '../../errors/ConeRecordError.ts';
import { EventId } from '../../utils/EventId.ts';

/** Evidence of an evicted register write, without its discarded property payload. */
export default class ConeEvictedValue {
  readonly event: EventId;
  readonly causal: boolean;

  constructor(fields: { readonly event: EventId; readonly causal: boolean }) {
    if (!(fields.event instanceof EventId) || typeof fields.causal !== 'boolean') {
      throw new ConeRecordError('Cone evicted value needs an event and its causal evidence');
    }
    this.event = fields.event;
    this.causal = fields.causal;
    Object.freeze(this);
  }
}
