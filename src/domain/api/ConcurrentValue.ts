import WarpError from '../errors/WarpError.ts';
import { createSnapshotPropValue } from '../services/ImmutableSnapshot.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import type { PropValue } from '../types/PropValue.ts';
import { requireNonEmptyString } from '../utils/scalarValidation.ts';

/** One value a writer wrote to a register, which no other retained write to it observed (#1039). */
export default class ConcurrentValue {
  readonly writer: string;
  readonly value: SnapshotPropValue;

  constructor(fields: Readonly<{ writer: string; value: PropValue }>) {
    if (fields === null || typeof fields !== 'object') {
      throw new WarpError('Concurrent value fields are required', 'E_PLURALITY');
    }
    requireNonEmptyString(fields.writer, 'concurrentValue.writer');
    this.writer = fields.writer;
    this.value = createSnapshotPropValue(fields.value);
    Object.freeze(this);
  }
}
