import VersionVector from '../crdt/VersionVector.ts';
import { Dot } from '../crdt/Dot.ts';
import WarpError from '../errors/WarpError.ts';
import type { EntityCapturePayload } from '../types/EntityCapturePayload.ts';
import EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import { compareEventIds, EventId } from '../utils/EventId.ts';
import Intent from '../api/Intent.ts';

type RetainedEntityAdmissionOptions = Readonly<{
  context: VersionVector | Readonly<Record<string, number>>;
  dot: Dot;
  eventId: EventId;
  origin: EntityAdmissionOrigin;
  properties: EntityCapturePayload;
  subject: string;
}>;

/** One entity birth recovered from retained patch history. */
export default class RetainedEntityAdmission {
  readonly context: VersionVector;
  readonly dot: Dot;
  readonly eventId: EventId;
  readonly intent: Intent;
  readonly origin: EntityAdmissionOrigin;
  readonly subject: string;

  constructor(options: RetainedEntityAdmissionOptions | null | undefined) {
    const required = requireRetainedOptions(options);
    requireCausalCoordinates(required);
    requireAdmissionOrigin(required);
    this.context = VersionVector.from(required.context);
    this.dot = required.dot;
    this.eventId = required.eventId;
    this.intent = Intent.addEntity({
      subject: required.subject,
      properties: required.properties,
    });
    this.origin = required.origin;
    this.subject = required.subject;
    Object.freeze(this);
  }

  /** Git WARP deterministic event order; this does not claim causality. */
  compare(other: RetainedEntityAdmission): number {
    if (!(other instanceof RetainedEntityAdmission)) {
      throw new WarpError(
        'Retained entity admission comparison requires another admission',
        'E_ENTITY_ADMISSION_RETAINED',
      );
    }
    return compareEventIds(this.eventId, other.eventId);
  }
}

function requireRetainedOptions(
  options: RetainedEntityAdmissionOptions | null | undefined,
): RetainedEntityAdmissionOptions {
  if (options === null || options === undefined) {
    throw retainedError('Retained entity admission options are required');
  }
  return options;
}

function requireCausalCoordinates(options: RetainedEntityAdmissionOptions): void {
  if (!(options.dot instanceof Dot)) {
    throw retainedError('Retained entity admission requires causal coordinates');
  }
  if (!(options.eventId instanceof EventId)) {
    throw retainedError('Retained entity admission requires causal coordinates');
  }
}

function requireAdmissionOrigin(options: RetainedEntityAdmissionOptions): void {
  if (!(options.origin instanceof EntityAdmissionOrigin)) {
    throw retainedError('Retained entity admission requires an allocation origin');
  }
}

function retainedError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_RETAINED');
}
