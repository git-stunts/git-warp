import WarpError from '../errors/WarpError.ts';
import { EventId } from '../utils/EventId.ts';

/**
 * One node's lifecycle records at a checkpoint, with the EventId of every
 * property register of the node that is not stale there.
 *
 * `birth`, `clear` and `pendingRemoves` are the node's entries in
 * `nodeBirthEvent`, `nodeClearEvent` and the reserved empty removal slot. A stale
 * register is left out: a later write that beats it is compared on its own,
 * and a later write it beats is stale too, so it never decides a read.
 * Registers are kept whether or not the node is live, because a later add
 * can make a later-ordered register visible again.
 */
export class NodeLifecycleRecord {
  readonly nodeId: string;
  readonly birth: EventId | null;
  readonly clear: EventId | null;
  readonly pendingRemoves: readonly EventId[];
  /** Property key to register EventId, in ascending key order. */
  readonly #registers: ReadonlyMap<string, EventId>;

  constructor(fields: {
    readonly nodeId: string;
    readonly birth: EventId | null;
    readonly clear: EventId | null;
    readonly pendingRemoves: readonly EventId[];
    readonly registers: readonly (readonly [string, EventId])[];
  }) {
    requireNodeId(fields.nodeId);
    this.nodeId = fields.nodeId;
    this.birth = requireOptionalEvent(fields.birth, 'birth');
    this.clear = requireOptionalEvent(fields.clear, 'clear');
    this.pendingRemoves = requirePendingRemoves(fields.pendingRemoves);
    this.#registers = requireRegisters(fields.registers);
    Object.freeze(this);
  }

  /** Detached enumeration snapshot; callers cannot mutate retained evidence. */
  get registers(): ReadonlyMap<string, EventId> {
    return new Map(this.#registers);
  }

  /** The EventId of the node's register for `key`, or null when it has none that is not stale. */
  registerEvent(key: string): EventId | null {
    return this.#registers.get(key) ?? null;
  }
}

function requireNodeId(nodeId: string): void {
  if (typeof nodeId !== 'string' || nodeId.length === 0 || nodeId.includes('\0')) {
    throw recordError('nodeId must be a non-empty string without NUL');
  }
}

function requireOptionalEvent(event: EventId | null, field: string): EventId | null {
  if (event !== null && !(event instanceof EventId)) {
    throw recordError(`${field} must be an EventId or null`);
  }
  return event;
}

/** Reserved transport slot: every qualifying removal now clears immediately. */
function requirePendingRemoves(removes: readonly EventId[]): readonly EventId[] {
  if (removes.length !== 0) {
    throw recordError('pendingRemoves must be empty under node-wide LWW clear semantics');
  }
  return Object.freeze([]);
}

function requireRegisters(
  registers: readonly (readonly [string, EventId])[],
): ReadonlyMap<string, EventId> {
  const map = new Map<string, EventId>();
  let previous = '';
  for (const [key, event] of registers) {
    requireRegisterKey(key, previous);
    if (!(event instanceof EventId)) {
      throw recordError('register events must be EventIds');
    }
    map.set(key, event);
    previous = key;
  }
  return map;
}

function requireRegisterKey(key: string, previous: string): void {
  if (typeof key !== 'string' || key.length === 0 || key.includes('\0')) {
    throw recordError('register keys must be non-empty strings without NUL');
  }
  if (previous >= key) {
    throw recordError('register keys must be unique and ascending');
  }
}

function recordError(message: string): WarpError {
  return new WarpError(`Node lifecycle record ${message}`, 'E_INVALID_SHARD');
}
