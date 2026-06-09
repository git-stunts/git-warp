import type { PropValue } from '../../types/PropValue.ts';

type StateDiffValue = PropValue | undefined;
type StateDiffObject = Exclude<StateDiffValue, string | number | boolean | null | undefined>;
type StateDiffRecord = { readonly [key: string]: StateDiffValue };

export function stateDiffValuesEqual(left: StateDiffValue, right: StateDiffValue): boolean {
  if (left === right) { return true; }
  if (!isNonNullObject(left) || !isNonNullObject(right)) { return false; }
  return stateDiffObjectsEqual(left, right);
}

function stateDiffArraysEqual(left: readonly StateDiffValue[], right: readonly StateDiffValue[]): boolean {
  if (left.length !== right.length) { return false; }
  for (let index = 0; index < left.length; index += 1) {
    if (!stateDiffValuesEqual(left[index], right[index])) { return false; }
  }
  return true;
}

function stateDiffRecordsEqual(left: StateDiffRecord, right: StateDiffRecord): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) { return false; }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key)) { return false; }
    if (!stateDiffValuesEqual(left[key], right[key])) { return false; }
  }
  return true;
}

function stateDiffObjectsEqual(left: object, right: object): boolean {
  if (left instanceof Uint8Array || right instanceof Uint8Array) {
    return stateDiffByteObjectsEqual(left, right);
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return stateDiffArrayObjectsEqual(left, right);
  }
  return stateDiffPlainObjectsEqual(left, right);
}

function stateDiffByteObjectsEqual(left: object, right: object): boolean {
  return left instanceof Uint8Array && right instanceof Uint8Array && stateDiffBytesEqual(left, right);
}

function stateDiffArrayObjectsEqual(left: object, right: object): boolean {
  return Array.isArray(left) && Array.isArray(right) && stateDiffArraysEqual(left, right);
}

function stateDiffPlainObjectsEqual(left: object, right: object): boolean {
  if (!isPlainRecord(left) || !isPlainRecord(right)) { return false; }
  return stateDiffRecordsEqual(left, right);
}

function stateDiffBytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) { return false; }
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) { return false; }
  }
  return true;
}

function isPlainRecord(value: object): value is StateDiffRecord {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isNonNullObject(value: StateDiffValue): value is StateDiffObject {
  return value !== null && typeof value === 'object';
}
