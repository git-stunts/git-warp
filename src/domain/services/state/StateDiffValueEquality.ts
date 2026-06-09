export function stateDiffValuesEqual(left: unknown, right: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (left === right) { return true; }
  if (!isNonNullObject(left) || !isNonNullObject(right)) { return false; }
  return stateDiffObjectsEqual(left as object, right as object);
}

function stateDiffArraysEqual(left: readonly unknown[], right: readonly unknown[]): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (left.length !== right.length) { return false; }
  for (let index = 0; index < left.length; index += 1) {
    if (!stateDiffValuesEqual(left[index], right[index])) { return false; }
  }
  return true;
}

function stateDiffRecordsEqual(
  left: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  right: Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
): boolean {
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
  if (Array.isArray(left)) {
    return Array.isArray(right) && stateDiffArraysEqual(left, right);
  }
  if (Array.isArray(right)) { return false; }
  return stateDiffRecordsEqual(
    left as Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
    right as Record<string, unknown>, // nosemgrep: ts-no-record-string-unknown-outside-adapters -- 0025B; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  );
}

function isNonNullObject(value: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return value !== null && typeof value === 'object';
}
