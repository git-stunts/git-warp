import Intent from '../api/Intent.ts';
import { bindRetainedEntityIntent } from '../api/RetainedEntityIntentRuntime.ts';
import type VersionVector from '../crdt/VersionVector.ts';
import type { Dot } from '../crdt/Dot.ts';
import type EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { EventId } from '../utils/EventId.ts';
import RetainedEntityAdmission from './RetainedEntityAdmission.ts';

/** The fields an admission index keeps for one retained entity birth. */
export type RecordedEntityAdmissionFields = Readonly<{
  context: VersionVector;
  dot: Dot;
  eventId: EventId;
  origin: EntityAdmissionOrigin;
  properties: Readonly<Record<string, PropValue>>;
  subject: string;
}>;

/**
 * Rebuilds a retained entity admission from the fields an admission index
 * recorded when it folded the admitting patch (#1039). The result is the same
 * value `entityAdmissionsFromPatch` produces from that patch.
 */
export function recordedEntityAdmission(fields: RecordedEntityAdmissionFields): RetainedEntityAdmission {
  const intent = bindRetainedEntityIntent(
    Intent.addEntity({ subject: fields.subject, properties: fields.properties }),
    fields.origin,
  );
  return new RetainedEntityAdmission({
    context: fields.context,
    dot: fields.dot,
    eventId: fields.eventId,
    intent,
    origin: fields.origin,
    subject: fields.subject,
  });
}

