/**
 * Immutable snapshot builders for public read-side returns.
 *
 * Snapshot construction is source-specific. This module does not preserve
 * unsupported class instances, clone prototypes, or reconstruct objects by
 * copying descriptors.
 *
 * @module domain/services/ImmutableSnapshot
 */

import type ORSet from '../crdt/ORSet.ts';
import { LWWRegister } from '../crdt/LWW.ts';
import WarpError from '../errors/WarpError.ts';
import { TickReceipt } from '../types/TickReceipt.ts';
import ImmutableBytes from './snapshot/ImmutableBytes.ts';
import SnapshotORSet from './snapshot/SnapshotORSet.ts';
import type { SnapshotPropValue } from './snapshot/SnapshotPropValue.ts';
import SnapshotVersionVector from './snapshot/SnapshotVersionVector.ts';
import SnapshotWarpState from './snapshot/SnapshotWarpState.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { EventId } from '../utils/EventId.ts';
import type VersionVector from '../crdt/VersionVector.ts';
import WarpState from './state/WarpState.ts';

type PropValueObject = { readonly [key: string]: PropValue };
type SnapshotPropValueObject = { readonly [key: string]: SnapshotPropValue };

class ReadonlySnapshotPropMap extends Map<string, LWWRegister<SnapshotPropValue>> {
  #sealed = false;

  constructor(source: Iterable<readonly [string, LWWRegister<PropValue>]>) {
    super();
    for (const [key, value] of source) {
      super.set(key, createLwwRegisterSnapshot(value));
    }
    this.#sealed = true;
  }

  override set(key: string, value: LWWRegister<SnapshotPropValue>): this {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'set');
    }
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'delete');
    }
    return super.delete(key);
  }

  override clear(): void {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'clear');
    }
    super.clear();
  }
}

class ReadonlySnapshotEventMap extends Map<string, EventId> {
  #sealed = false;

  constructor(source: Map<string, EventId>) {
    super();
    for (const [key, value] of source) {
      super.set(key, value);
    }
    this.#sealed = true;
  }

  override set(key: string, value: EventId): this {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'set');
    }
    return super.set(key, value);
  }

  override delete(key: string): boolean {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'delete');
    }
    return super.delete(key);
  }

  override clear(): void {
    if (this.#sealed) {
      throw createReadonlyMutationError('Map', 'clear');
    }
    super.clear();
  }
}

/**
 * Build a domain error for attempts to mutate a read-only collection snapshot.
 */
function createReadonlyMutationError(kind: 'Map', method: string): WarpError {
  return new WarpError(
    `${kind} snapshot is read-only; ${method}() is not allowed`,
    'E_IMMUTABLE_SNAPSHOT_MUTATION',
    { context: { kind, method } },
  );
}

function createUnsupportedSnapshotSourceError(expected: string): WarpError {
  return new WarpError(
    `unsupported snapshot source: expected ${expected}`,
    'E_IMMUTABLE_SNAPSHOT_UNSUPPORTED_SOURCE',
    { context: { expected } },
  );
}

function createReadonlyPropMap(
  source: Iterable<readonly [string, LWWRegister<PropValue>]>,
): ReadonlyMap<string, LWWRegister<SnapshotPropValue>> {
  const snapshot = new ReadonlySnapshotPropMap(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createReadonlyEventMap(source: Map<string, EventId>): ReadonlyMap<string, EventId> {
  const snapshot = new ReadonlySnapshotEventMap(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createSnapshotPropValueArray(source: readonly PropValue[]): readonly SnapshotPropValue[] {
  const snapshot: SnapshotPropValue[] = [];
  for (const value of source) {
    snapshot.push(createSnapshotPropValue(value));
  }
  return Object.freeze(snapshot);
}

function createSnapshotPropValueObject(source: PropValueObject): SnapshotPropValueObject {
  const snapshot: { [key: string]: SnapshotPropValue } = {};
  for (const [key, value] of Object.entries(source)) {
    Object.defineProperty(snapshot, key, {
      value: createSnapshotPropValue(value),
      enumerable: true,
      configurable: false,
      writable: false,
    });
  }
  return Object.freeze(snapshot);
}

export function createSnapshotPropValue(source: PropValue): SnapshotPropValue {
  if (source instanceof Uint8Array) {
    return new ImmutableBytes(source);
  }
  if (Array.isArray(source)) {
    return createSnapshotPropValueArray(source);
  }
  if (source !== null && typeof source === 'object') {
    return createSnapshotPropValueObject(source);
  }
  return source;
}

export function createSnapshotPropertyValues(
  source: { readonly [key: string]: PropValue },
): Readonly<{ [key: string]: SnapshotPropValue }> {
  return createSnapshotPropValueObject(source);
}

function createLwwRegisterSnapshot(
  source: LWWRegister<PropValue>,
): LWWRegister<SnapshotPropValue> {
  return new LWWRegister(source.eventId, createSnapshotPropValue(source.value));
}

export function createSnapshotORSet(value: ORSet): SnapshotORSet {
  return new SnapshotORSet(value);
}

export function createSnapshotVersionVector(value: VersionVector): SnapshotVersionVector {
  return new SnapshotVersionVector(value);
}

export function createSnapshotWarpState(state: WarpState): SnapshotWarpState {
  if (!(state instanceof WarpState)) {
    throw createUnsupportedSnapshotSourceError('WarpState');
  }

  return new SnapshotWarpState({
    nodeAlive: createSnapshotORSet(state.nodeAlive),
    edgeAlive: createSnapshotORSet(state.edgeAlive),
    prop: createReadonlyPropMap(state.allPropEntries()),
    observedFrontier: createSnapshotVersionVector(state.observedFrontier),
    edgeBirthEvent: createReadonlyEventMap(state.edgeBirthEvent),
  });
}

/**
 * Create a detached, immutable public snapshot of a WarpState instance.
 */
export function createImmutableWarpStateSnapshot(state: WarpState): SnapshotWarpState {
  return createSnapshotWarpState(state);
}

/**
 * Create a detached, frozen public snapshot of materialization receipts.
 */
export function createImmutableTickReceiptArraySnapshot(
  receipts: readonly TickReceipt[],
): readonly TickReceipt[] {
  if (!Array.isArray(receipts)) {
    throw createUnsupportedSnapshotSourceError('TickReceipt[]');
  }

  const snapshot: TickReceipt[] = [];
  for (const receipt of receipts) {
    if (!(receipt instanceof TickReceipt)) {
      throw createUnsupportedSnapshotSourceError('TickReceipt[]');
    }
    snapshot.push(receipt);
  }

  return Object.freeze(snapshot);
}

export { ImmutableBytes, SnapshotORSet, SnapshotVersionVector, SnapshotWarpState };
export type { SnapshotPropValue };
