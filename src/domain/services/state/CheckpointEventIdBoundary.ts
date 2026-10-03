import { EventId } from '../../utils/EventId.ts';
import LegacyEventId from '../../utils/LegacyEventId.ts';
import CrdtError from '../../errors/CrdtError.ts';

const CURRENT_CHECKPOINT_FORMAT = 'full-v7';

/** Checkpoint transport; its declared fields still require runtime admission. */
export type CheckpointEventIdWire = {
  lamport?: number | undefined;
  writerId?: string | undefined;
  patchSha?: string | undefined;
  opIndex?: number | undefined;
};

/** Preserve historical sentinel ordering without weakening current EventId. */
export function readCheckpointEventId(
  wire: CheckpointEventIdWire | null | undefined, format: string | undefined,
): EventId | LegacyEventId {
  if (wire === null || wire === undefined) { return readAbsentIdentity(format); }
  requireEventWire(wire);
  if (hasLegacyFields(wire)) { return readLegacyIdentity(wire, format); }
  return readCurrentIdentity(wire);
}

function requireEventWire(wire: CheckpointEventIdWire): void {
  if (typeof wire !== 'object' || Array.isArray(wire)) {
    throw new CrdtError('Checkpoint event identity must be an object');
  }
  if (!hasCheckpointRecordPrototype(wire)) {
    throw new CrdtError('Checkpoint event identity must be a plain transport record');
  }
  if (!hasTypedEventFields(wire)) {
    throw new CrdtError('Checkpoint event identity fields have invalid types');
  }
}

function hasCheckpointRecordPrototype(wire: CheckpointEventIdWire): boolean {
  const prototype = Reflect.getPrototypeOf(wire);
  return prototype === Object.prototype || prototype === null;
}

function hasTypedEventFields(wire: CheckpointEventIdWire): boolean {
  return isNumericEventField(wire.lamport) && isTextEventField(wire.writerId)
    && isTextEventField(wire.patchSha) && isNumericEventField(wire.opIndex);
}

function isNumericEventField(value: number | undefined): boolean {
  return value === undefined || typeof value === 'number';
}

function isTextEventField(value: string | undefined): boolean {
  return value === undefined || typeof value === 'string';
}

function readAbsentIdentity(format: string | undefined): LegacyEventId {
  if (format === CURRENT_CHECKPOINT_FORMAT) { throw new CrdtError('Current checkpoint event identity is missing'); }
  return new LegacyEventId(0);
}

function hasLegacyFields(wire: CheckpointEventIdWire): boolean {
  return isLegacyField(wire.writerId, '')
    && isLegacyField(wire.patchSha, '0000') && isLegacyField(wire.opIndex, 0);
}

function isLegacyField(value: string | number | undefined, sentinel: string | number): boolean {
  return value === undefined || value === sentinel;
}

function readLegacyIdentity(wire: CheckpointEventIdWire, format: string | undefined): LegacyEventId {
  if (format === CURRENT_CHECKPOINT_FORMAT && !hasCompleteIdentity(wire)) {
    throw new CrdtError('Current checkpoint cannot omit legacy identity fields');
  }
  return new LegacyEventId(wire.lamport ?? 0);
}

function hasCompleteIdentity(wire: CheckpointEventIdWire): boolean {
  return [wire.lamport, wire.writerId, wire.patchSha, wire.opIndex].every(value => value !== undefined);
}

function readCurrentIdentity(wire: CheckpointEventIdWire): EventId {
  return new EventId(wire.lamport ?? 0, wire.writerId ?? '', wire.patchSha ?? '', wire.opIndex ?? -1);
}
