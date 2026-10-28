import ConeRecordError from '../../errors/ConeRecordError.ts';
import { EventId } from '../../utils/EventId.ts';

/** What a lifecycle event did to its element: removed it, or added or edited it. */
export type ConeLifecycleRole = 'remove' | 'edit';

const ROLES: ReadonlySet<string> = new Set(['remove', 'edit']);

/**
 * One patch's last lifecycle effect on a node or edge that no other retained
 * effect has observed (#1039): a remove, or an add or property edit. A remove
 * and an edit retained together raced: neither patch saw the other.
 */
export default class ConeLifecycleEvent {
  readonly event: EventId;
  readonly role: ConeLifecycleRole;
  readonly causal: boolean;

  constructor(fields: { readonly event: EventId; readonly role: ConeLifecycleRole; readonly causal: boolean }) {
    if (!(fields.event instanceof EventId) || !ROLES.has(fields.role) || typeof fields.causal !== 'boolean') {
      throw new ConeRecordError('Cone lifecycle event needs an event, a role and its causal evidence');
    }
    this.event = fields.event;
    this.role = fields.role;
    this.causal = fields.causal;
    Object.freeze(this);
  }
}
