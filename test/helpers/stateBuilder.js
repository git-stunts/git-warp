import { vi } from 'vitest';
import { createDot, encodeDot } from '../../src/domain/crdt/Dot.ts';
import ORSet from '../../src/domain/crdt/ORSet.ts';
import { applyOpV2, createEmptyState, encodeEdgeKey } from '../../src/domain/services/JoinReducer.ts';
import { createEventId } from '../../src/domain/utils/EventId.ts';

/**
 * @typedef {import('../../src/domain/services/JoinReducer.ts').WarpState} WarpState
 */

/**
 * @typedef {{
 *   writerId?: string,
 *   counter?: number,
 *   lamport?: number,
 *   patchSha?: string,
 *   opIndex?: number
 * }} BuilderEventOptions
 */

/**
 * @typedef {BuilderEventOptions & {
 *   observed?: Array<string|{writerId: string, counter: number}>|Set<string>
 * }} BuilderRemoveOptions
 */

/**
 * Fluently seeds WarpState instances for tests without spelling out
 * low-level OR-Set/LWW mutations in each file.
 */
export class StateBuilder {
  constructor() {
    /** @type {WarpState} */
    this._state = createEmptyState();
    this._nextCounter = 1;
    this._nextLamport = 1;
  }

  /**
   * @param {number|undefined} explicit
   * @returns {number}
   */
  _takeCounter(explicit) {
    if (typeof explicit === 'number' && Number.isInteger(explicit) && explicit > 0) {
      this._nextCounter = Math.max(this._nextCounter, explicit + 1);
      return explicit;
    }
    return this._nextCounter++;
  }

  /**
   * @param {number|undefined} explicit
   * @param {number} fallback
   * @returns {number}
   */
  _takeLamport(explicit, fallback) {
    const lamport = typeof explicit === 'number' && Number.isInteger(explicit) && explicit > 0
      ? explicit
      : fallback;
    this._nextLamport = Math.max(this._nextLamport, lamport + 1);
    return lamport;
  }

  /**
   * @param {BuilderEventOptions} [options]
   * @returns {{ dot: import('../../src/domain/crdt/Dot.js').Dot, eventId: import('../../src/domain/utils/EventId.ts').EventId }}
   */
  _createMutationContext(options = {}) {
    const writerId = options.writerId || 'w1';
    const counter = this._takeCounter(options.counter);
    const lamport = this._takeLamport(options.lamport, counter);
    return {
      dot: createDot(writerId, counter),
      eventId: createEventId(lamport, writerId, options.patchSha || 'aabbccdd', options.opIndex || 0),
    };
  }

  /**
   * @param {Array<string|{writerId: string, counter: number}>|Set<string>|undefined} observed
   * @returns {Set<string>|null}
   */
  _normalizeObserved(observed) {
    if (!observed) {
      return null;
    }
    if (observed instanceof Set) {
      return new Set(observed);
    }
    return new Set(observed.map((value) => {
      if (typeof value === 'string') {
        return value;
      }
      return encodeDot(createDot(value.writerId, value.counter));
    }));
  }

  /**
   * @param {string} nodeId
   * @param {BuilderEventOptions} [options]
   * @returns {StateBuilder}
   */
  node(nodeId, options = {}) {
    const { dot, eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    return this;
  }

  /**
   * @param {string} nodeId
   * @param {BuilderRemoveOptions} [options]
   * @returns {StateBuilder}
   */
  removeNode(nodeId, options = {}) {
    const { eventId } = this._createMutationContext(options);
    const observedDots = this._normalizeObserved(options.observed) || this._state.nodeAlive.getDots(nodeId);
    applyOpV2(
      this._state,
      /** @type {any} */ ({ type: 'NodeRemove', node: nodeId, observedDots }),
      eventId,
    );
    return this;
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {string} label
   * @param {BuilderEventOptions} [options]
   * @returns {StateBuilder}
   */
  edge(from, to, label, options = {}) {
    const { dot, eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    return this;
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {string} label
   * @param {BuilderRemoveOptions} [options]
   * @returns {StateBuilder}
   */
  removeEdge(from, to, label, options = {}) {
    const { eventId } = this._createMutationContext(options);
    const edgeKey = encodeEdgeKey(from, to, label);
    const observedDots = this._normalizeObserved(options.observed) || this._state.edgeAlive.getDots(edgeKey);
    applyOpV2(
      this._state,
      /** @type {any} */ ({ type: 'EdgeRemove', from, to, label, observedDots }),
      eventId,
    );
    return this;
  }

  /**
   * @param {string} nodeId
   * @param {string} key
   * @param {unknown} value
   * @param {BuilderEventOptions} [options]
   * @returns {StateBuilder}
   */
  nodeProp(nodeId, key, value, options = {}) {
    const { eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'NodePropSet', node: nodeId, key, value }, eventId);
    return this;
  }

  /**
   * @param {string} from
   * @param {string} to
   * @param {string} label
   * @param {string} key
   * @param {unknown} value
   * @param {BuilderEventOptions} [options]
   * @returns {StateBuilder}
   */
  edgeProp(from, to, label, key, value, options = {}) {
    const { eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'EdgePropSet', from, to, label, key, value }, eventId);
    return this;
  }

  /**
   * Marks a writer/counter as observed in the state's version vector.
   *
   * @param {string} writerId
   * @param {number} counter
   * @returns {StateBuilder}
   */
  vv(writerId, counter) {
    const current = this._state.observedFrontier.get(writerId) || 0;
    this._state.observedFrontier.set(writerId, Math.max(current, counter));
    this._nextCounter = Math.max(this._nextCounter, counter + 1);
    this._nextLamport = Math.max(this._nextLamport, counter + 1);
    return this;
  }

  /**
   * Seeds a WarpRuntime-like object with the built state and a stable materialize mock.
   *
   * @param {any} graph
   * @returns {WarpState}
   */
  seedGraph(graph) {
    graph._cachedState = this._state;
    graph.materialize = vi.fn().mockResolvedValue(this._state);
    return this._state;
  }

  /**
   * @returns {WarpState}
   */
  build() {
    return this._state;
  }
}

/**
 * @returns {StateBuilder}
 */
export function createStateBuilder() {
  return new StateBuilder();
}
