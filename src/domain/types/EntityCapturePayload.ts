import { propValuesEqual, type PropValue } from './PropValue.ts';

/** Property record carried by one single-patch entity capture. */
export type EntityCapturePayload = Readonly<Record<string, PropValue>>;

/** Whether an entity payload has a plain or null-prototype record boundary. */
export function isEntityCapturePayloadRecord(properties: EntityCapturePayload): boolean {
  if (properties === null || typeof properties !== 'object' || Array.isArray(properties)) {
    return false;
  }
  const prototype = Reflect.getPrototypeOf(properties);
  return prototype === Object.prototype || prototype === null;
}

/** Exact equality over normalized entity property records. */
export function entityCapturePayloadsEqual(
  left: EntityCapturePayload,
  right: EntityCapturePayload,
): boolean {
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key, index) => {
    const rightKey = rightKeys[index];
    const leftValue = left[key];
    const rightValue = right[key];
    return rightKey === key
      && leftValue !== undefined
      && rightValue !== undefined
      && propValuesEqual(leftValue, rightValue);
  });
}
