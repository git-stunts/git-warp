import ConeRecordError from '../../errors/ConeRecordError.ts';
import { isPropValue, type PropValue } from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';

/**
 * One write to a property register that no other retained write to it has
 * observed (#1039): its event, the value it wrote, and whether its patch
 * carried causal evidence.
 */
export default class ConeConcurrentValue {
  readonly event: EventId;
  readonly value: PropValue;
  readonly causal: boolean;

  constructor(fields: { readonly event: EventId; readonly value: PropValue; readonly causal: boolean }) {
    if (!(fields.event instanceof EventId) || !isPropValue(fields.value) || typeof fields.causal !== 'boolean') {
      throw new ConeRecordError('Cone concurrent value needs an event, a property value and its causal evidence');
    }
    this.event = fields.event;
    this.value = fields.value;
    this.causal = fields.causal;
    Object.freeze(this);
  }
}
