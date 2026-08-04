import type { PropValue } from './PropValue.ts';

/** Property record carried by one dependency-pure entity capture. */
export type EntityCapturePayload = Readonly<Record<string, PropValue>>;

/** Whether an entity payload has a plain or null-prototype record boundary. */
export function isEntityCapturePayloadRecord(properties: EntityCapturePayload): boolean {
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(properties);
  return prototype === Object.prototype || prototype === null;
}
