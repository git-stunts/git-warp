import WarpError from '../errors/WarpError.ts';
import ImmutableBytes from '../services/snapshot/ImmutableBytes.ts';
import type { EntityCapturePayload } from '../types/EntityCapturePayload.ts';
import type EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import type { PropValue } from '../types/PropValue.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';
import type { ReadingValue } from './ReadingValue.ts';
import { registerReadingDomainObject } from './ReadingValueRuntime.ts';

type EntityAdmissionOptions = Readonly<{
  occurrenceId: string;
  orderingKey: string;
  origin: EntityAdmissionOrigin;
  properties: EntityCapturePayload;
  subject: string;
}>;

export type EntityAdmissionOccurrenceReference = Readonly<{ readonly id: string }>;
export type EntityAdmissionRepresentationReference = Readonly<{ readonly subject: string }>;
export type EntityAdmissionOrdering = Readonly<{
  readonly key: string;
  readonly semantics: 'deterministic-non-causal';
}>;
export type EntityAdmissionOriginReading = Readonly<{
  readonly kind: EntityAdmissionOrigin['kind'];
  readonly namespace: string | null;
}>;
export type EntityAdmissionInitialProperties = Readonly<{
  readonly [key: string]: ReadingValue;
}>;

/** Public storage-neutral Reading value for one retained entity birth. */
export default class EntityAdmission {
  readonly [key: string]: ReadingValue;
  readonly occurrence: EntityAdmissionOccurrenceReference;
  readonly representation: EntityAdmissionRepresentationReference;
  readonly initialProperties: EntityAdmissionInitialProperties;
  readonly origin: EntityAdmissionOriginReading;
  readonly ordering: EntityAdmissionOrdering;

  constructor(options: EntityAdmissionOptions | null | undefined) {
    if (options === null || options === undefined) {
      throw new WarpError(
        'EntityAdmission options are required',
        'E_ENTITY_ADMISSION_READING',
      );
    }
    requireNonEmptyString(options.occurrenceId, 'entityAdmission.occurrence.id');
    requireNonEmptyString(options.subject, 'entityAdmission.representation.subject');
    requireNonEmptyString(options.orderingKey, 'entityAdmission.ordering.key');
    this.occurrence = Object.freeze({ id: options.occurrenceId });
    this.representation = Object.freeze({ subject: options.subject });
    this.initialProperties = snapshotProperties(options.properties);
    this.origin = Object.freeze({
      kind: options.origin.kind,
      namespace: options.origin.namespace,
    });
    this.ordering = Object.freeze({
      key: options.orderingKey,
      semantics: 'deterministic-non-causal',
    });
    Object.freeze(this);
    registerReadingDomainObject(this);
  }
}

function snapshotProperties(
  properties: EntityCapturePayload,
): EntityAdmissionInitialProperties {
  return snapshotPropertyRecord(properties);
}

function snapshotPropertyValue(value: PropValue): ReadingValue {
  if (value instanceof Uint8Array) {
    return new ImmutableBytes(value);
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map(snapshotPropertyValue));
  }
  if (value !== null && typeof value === 'object') {
    return snapshotPropertyRecord(value);
  }
  return value;
}

function snapshotPropertyRecord(
  value: { readonly [key: string]: PropValue },
): Readonly<{ readonly [key: string]: ReadingValue }> {
  const snapshot: { [key: string]: ReadingValue } = {};
  for (const [key, entry] of Object.entries(value)) {
    Object.defineProperty(snapshot, key, {
      value: snapshotPropertyValue(entry),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(snapshot);
}
