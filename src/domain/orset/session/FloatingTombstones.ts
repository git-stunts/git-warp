import { Dot } from "../../crdt/Dot.ts";
import { decodeObservedDot } from "../../crdt/decodeObservedDot.ts";
import type ORSet from "../../crdt/ORSet.ts";
import CrdtError from "../../errors/CrdtError.ts";
import type ORSetElementState from "../ORSetElementState.ts";
import type StateSession from "./StateSession.ts";

/**
 * Tombstones whose dots no OR-set entry holds, for nodes and for edges
 * (#1153).
 *
 * A remove can arrive before the add it observed, for example through
 * sync, which applies patches with the in-memory reducer. The in-memory
 * `ORSet` keeps such a tombstone in its flat tombstone set, and a full
 * state (a checkpoint, a replay basis, a state-cache snapshot) stores it
 * there. The session trie stores a tombstone only under an element, so a
 * session that starts from such a state has no place for it.
 *
 * A reducer frame keeps these tombstones beside its session. An add of one
 * of these dots arrives tombstoned, as in the in-memory `ORSet`, and the
 * state projected from the session lists them again. The set does not
 * change during a session: tombstones only grow, and an add that meets one
 * stores it in the trie under the added element.
 */
export default class FloatingTombstones {
  readonly #nodeDots: ReadonlySet<string>;
  readonly #edgeDots: ReadonlySet<string>;

  constructor(fields: {
    readonly nodeDots: Iterable<string>;
    readonly edgeDots: Iterable<string>;
  }) {
    this.#nodeDots = canonicalDots(fields.nodeDots);
    this.#edgeDots = canonicalDots(fields.edgeDots);
    Object.freeze(this);
  }

  static none(): FloatingTombstones {
    return new FloatingTombstones({ nodeDots: [], edgeDots: [] });
  }

  /** The tombstones of a state's node and edge OR-sets that no entry holds. */
  static of(state: {
    readonly nodeAlive: ORSet;
    readonly edgeAlive: ORSet;
  }): FloatingTombstones {
    return new FloatingTombstones({
      nodeDots: unheldTombstones(state.nodeAlive),
      edgeDots: unheldTombstones(state.edgeAlive),
    });
  }

  nodeDots(): IterableIterator<string> {
    return this.#nodeDots.values();
  }

  edgeDots(): IterableIterator<string> {
    return this.#edgeDots.values();
  }

  join(other: FloatingTombstones): FloatingTombstones {
    return new FloatingTombstones({
      nodeDots: [...this.#nodeDots, ...other.#nodeDots],
      edgeDots: [...this.#edgeDots, ...other.#edgeDots],
    });
  }

  /** Adds a node dot to the session; a floating tombstone for it applies at once. */
  async addNode(session: StateSession, node: string, dot: Dot): Promise<void> {
    await session.addNode(node, dot);
    const encodedDot = Dot.encode(dot);
    if (this.#nodeDots.has(encodedDot)) {
      await session.removeNode(node, new Set([encodedDot]));
    }
  }

  /** Adds an edge dot to the session; a floating tombstone for it applies at once. */
  async addEdge(session: StateSession, edgeKey: string, dot: Dot): Promise<void> {
    await session.addEdge(edgeKey, dot);
    const encodedDot = Dot.encode(dot);
    if (this.#edgeDots.has(encodedDot)) {
      await session.removeEdge(edgeKey, new Set([encodedDot]));
    }
  }

  /**
   * Tombstones every live dot of the session that one of these tombstones
   * names. A join needs it: the other side's entries can hold such a dot.
   * It scans the session, so it runs only when a tombstone exists.
   */
  async tombstoneHeldDots(session: StateSession): Promise<void> {
    const nodes = await liveDotsIn(session.scanNodeElementStates(), this.#nodeDots);
    for (const [node, dots] of nodes) {
      await session.removeNode(node, dots);
    }
    const edges = await liveDotsIn(session.scanEdgeElementStates(), this.#edgeDots);
    for (const [edgeKey, dots] of edges) {
      await session.removeEdge(edgeKey, dots);
    }
  }
}

/**
 * Copies the dots. Each must be a canonical encoded dot, as ORSet
 * tombstones are; `Dot.decode` refuses any other string.
 */
function canonicalDots(dots: Iterable<string>): ReadonlySet<string> {
  const copied = new Set<string>();
  for (const encodedDot of dots) {
    if (typeof encodedDot !== "string") {
      throw new CrdtError("FloatingTombstones encoded dot must be a string");
    }
    Dot.decode(encodedDot);
    copied.add(encodedDot);
  }
  return copied;
}

/**
 * The tombstones that no entry holds. A tombstone that is not a canonical
 * dot is skipped: no add can carry it, as the session trie also assumes.
 */
function unheldTombstones(set: ORSet): Set<string> {
  const unheld = new Set<string>();
  for (const encodedDot of set.tombstonesIter()) {
    if (decodeObservedDot(encodedDot) !== null) {
      unheld.add(encodedDot);
    }
  }
  if (unheld.size === 0) {
    return unheld;
  }
  for (const encodedDot of set.entryDotsIter()) {
    unheld.delete(encodedDot);
  }
  return unheld;
}

/** The live dots of each element that are in `tombstoned`; collected before any mutation. */
async function liveDotsIn(
  states: AsyncIterable<ORSetElementState>,
  tombstoned: ReadonlySet<string>,
): Promise<ReadonlyMap<string, ReadonlySet<string>>> {
  const held = new Map<string, ReadonlySet<string>>();
  if (tombstoned.size === 0) {
    return held;
  }
  for await (const state of states) {
    const dots = new Set([...state.dots].filter((dot) => tombstoned.has(dot)));
    if (dots.size > 0) {
      held.set(state.element, dots);
    }
  }
  return held;
}
