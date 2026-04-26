/**
 * Immutable snapshot builders for public read-side returns.
 *
 * Snapshot construction is source-specific. This module does not preserve
 * unsupported class instances, clone prototypes, or reconstruct objects by
 * copying descriptors.
 *
 * @module domain/services/ImmutableSnapshot
 */

import ORSet from '../crdt/ORSet.ts';
import VersionVector from '../crdt/VersionVector.ts';
import { LWWRegister } from '../crdt/LWW.ts';
import WarpError from '../errors/WarpError.ts';
import { TickReceipt } from '../types/TickReceipt.ts';
import type { PropValue } from '../types/PropValue.ts';
import type { EventId } from '../utils/EventId.ts';
import WarpState from './state/WarpState.ts';

type PropValueObject = { readonly [key: string]: PropValue };

class ReadonlySnapshotStringSet extends Set<string> {
  #sealed = false;

  constructor(source: Iterable<string>) {
    super();
    for (const value of source) {
      super.add(value);
    }
    this.#sealed = true;
  }

  override add(value: string): this {
    if (this.#sealed) {
      throw createReadonlyMutationError('Set', 'add');
    }
    return super.add(value);
  }

  override delete(value: string): boolean {
    if (this.#sealed) {
      throw createReadonlyMutationError('Set', 'delete');
    }
    return super.delete(value);
  }

  override clear(): void {
    if (this.#sealed) {
      throw createReadonlyMutationError('Set', 'clear');
    }
    super.clear();
  }
}

class ReadonlySnapshotStringSetMap extends Map<string, Set<string>> {
  #sealed = false;

  constructor(source: Map<string, Set<string>>) {
    super();
    for (const [key, value] of source) {
      super.set(key, createReadonlyStringSet(value));
    }
    this.#sealed = true;
  }

  override set(key: string, value: Set<string>): this {
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

class ReadonlySnapshotPropMap extends Map<string, LWWRegister<PropValue>> {
  #sealed = false;

  constructor(source: Map<string, LWWRegister<PropValue>>) {
    super();
    for (const [key, value] of source) {
      super.set(key, createLwwRegisterSnapshot(value));
    }
    this.#sealed = true;
  }

  override set(key: string, value: LWWRegister<PropValue>): this {
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
function createReadonlyMutationError(kind: 'Map' | 'Set', method: string): WarpError {
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

function createReadonlyStringSet(source: Set<string>): Set<string> {
  const snapshot = new ReadonlySnapshotStringSet(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createReadonlyStringSetMap(source: Map<string, Set<string>>): Map<string, Set<string>> {
  const snapshot = new ReadonlySnapshotStringSetMap(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createReadonlyPropMap(source: Map<string, LWWRegister<PropValue>>): Map<string, LWWRegister<PropValue>> {
  const snapshot = new ReadonlySnapshotPropMap(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createReadonlyEventMap(source: Map<string, EventId>): Map<string, EventId> {
  const snapshot = new ReadonlySnapshotEventMap(source);
  Object.freeze(snapshot);
  return snapshot;
}

function createOrSetSnapshot(source: ORSet): ORSet {
  const cloned = source.clone();
  const snapshot = new ORSet(
    createReadonlyStringSetMap(cloned.entries),
    createReadonlyStringSet(cloned.tombstones),
  );
  Object.freeze(snapshot);
  return snapshot;
}

function createVersionVectorSnapshot(source: VersionVector): VersionVector {
  const snapshot = source.clone();
  Object.freeze(snapshot);
  return snapshot;
}

function createPropValueArraySnapshot(source: readonly PropValue[]): PropValue[] {
  const snapshot: PropValue[] = [];
  for (const value of source) {
    snapshot.push(createPropValueSnapshot(value));
  }
  Object.freeze(snapshot);
  return snapshot;
}

function createPropValueObjectSnapshot(source: PropValueObject): { [key: string]: PropValue } {
  const snapshot: { [key: string]: PropValue } = {};
  for (const [key, value] of Object.entries(source)) {
    snapshot[key] = createPropValueSnapshot(value);
  }
  Object.freeze(snapshot);
  return snapshot;
}

function createPropValueSnapshot(source: PropValue): PropValue {
  if (source instanceof Uint8Array) {
    return new Uint8Array(source);
  }
  if (Array.isArray(source)) {
    return createPropValueArraySnapshot(source);
  }
  if (source !== null && typeof source === 'object') {
    return createPropValueObjectSnapshot(source);
  }
  return source;
}

function createLwwRegisterSnapshot(source: LWWRegister<PropValue>): LWWRegister<PropValue> {
  return new LWWRegister(source.eventId, createPropValueSnapshot(source.value));
}

/**
 * Create a detached, read-only public snapshot of a WarpState instance.
 */
export function createImmutableWarpStateSnapshot(state: WarpState): WarpState {
  if (!(state instanceof WarpState)) {
    throw createUnsupportedSnapshotSourceError('WarpState');
  }

  const snapshot = new WarpState({
    nodeAlive: createOrSetSnapshot(state.nodeAlive),
    edgeAlive: createOrSetSnapshot(state.edgeAlive),
    prop: createReadonlyPropMap(state.prop),
    observedFrontier: createVersionVectorSnapshot(state.observedFrontier),
    edgeBirthEvent: createReadonlyEventMap(state.edgeBirthEvent),
  });

  Object.freeze(snapshot);
  return snapshot;
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
