import { vi } from 'vitest';
import { Dot, encodeDot } from '../../src/domain/crdt/Dot.ts';
import { applyOpV2, createEmptyState, encodeEdgeKey } from '../../src/domain/services/JoinReducer.ts';
import type WarpState from '../../src/domain/services/state/WarpState.ts';
import { EventId } from '../../src/domain/utils/EventId.ts';

type BuilderEventOptions = {
  writerId?: string;
  counter?: number;
  lamport?: number;
  patchSha?: string;
  opIndex?: number;
};

type BuilderRemoveOptions = BuilderEventOptions & {
  observed?: Array<string | { writerId: string; counter: number }> | Set<string>;
};

/**
 * Fluently seeds WarpState instances for tests without spelling out
 * low-level OR-Set/LWW mutations in each file.
 */
export class StateBuilder {
  _state: WarpState;
  _nextCounter: number;
  _nextLamport: number;

  constructor() {
    this._state = createEmptyState();
    this._nextCounter = 1;
    this._nextLamport = 1;
  }

  _takeCounter(explicit: number | undefined): number {
    if (typeof explicit === 'number' && Number.isInteger(explicit) && explicit > 0) {
      this._nextCounter = Math.max(this._nextCounter, explicit + 1);
      return explicit;
    }
    return this._nextCounter++;
  }

  _takeLamport(explicit: number | undefined, fallback: number): number {
    const lamport = typeof explicit === 'number' && Number.isInteger(explicit) && explicit > 0
      ? explicit
      : fallback;
    this._nextLamport = Math.max(this._nextLamport, lamport + 1);
    return lamport;
  }

  _createMutationContext(options: BuilderEventOptions = {}) {
    const writerId = options.writerId || 'w1';
    const counter = this._takeCounter(options.counter);
    const lamport = this._takeLamport(options.lamport, counter);
    return {
      dot: Dot.create(writerId, counter),
      eventId: new EventId(lamport, writerId, options.patchSha || 'aabbccdd', options.opIndex || 0),
    };
  }

  _normalizeObserved(observed: Array<string | { writerId: string; counter: number }> | Set<string> | undefined): Set<string> | null {
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
      return encodeDot(Dot.create(value.writerId, value.counter));
    }));
  }

  node(nodeId: string, options: BuilderEventOptions = {}): StateBuilder {
    const { dot, eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'NodeAdd', node: nodeId, dot }, eventId);
    return this;
  }

  removeNode(nodeId: string, options: BuilderRemoveOptions = {}): StateBuilder {
    const { eventId } = this._createMutationContext(options);
    const observedDots = this._normalizeObserved(options.observed) || this._state.nodeAlive.getDots(nodeId);
    applyOpV2(
      this._state,
      /** @type {any} */ ({ type: 'NodeRemove', node: nodeId, observedDots }),
      eventId,
    );
    return this;
  }

  edge(from: string, to: string, label: string, options: BuilderEventOptions = {}): StateBuilder {
    const { dot, eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'EdgeAdd', from, to, label, dot }, eventId);
    return this;
  }

  removeEdge(from: string, to: string, label: string, options: BuilderRemoveOptions = {}): StateBuilder {
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

  nodeProp(nodeId: string, key: string, value: unknown, options: BuilderEventOptions = {}): StateBuilder {
    const { eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'NodePropSet', node: nodeId, key, value }, eventId);
    return this;
  }

  edgeProp(from: string, to: string, label: string, key: string, value: unknown, options: BuilderEventOptions = {}): StateBuilder {
    const { eventId } = this._createMutationContext(options);
    applyOpV2(this._state, { type: 'EdgePropSet', from, to, label, key, value }, eventId);
    return this;
  }

  /**
   * Marks a writer/counter as observed in the state's version vector.
   */
  vv(writerId: string, counter: number): StateBuilder {
    const current = this._state.observedFrontier.get(writerId) || 0;
    this._state.observedFrontier.set(writerId, Math.max(current, counter));
    this._nextCounter = Math.max(this._nextCounter, counter + 1);
    this._nextLamport = Math.max(this._nextLamport, counter + 1);
    return this;
  }

  /**
   * Seeds a WarpRuntime-like object with the built state and a stable materialize mock.
   */
  seedGraph(graph: { _cachedState?: WarpState; materialize?: unknown }): WarpState {
    graph._cachedState = this._state;
    graph.materialize = vi.fn().mockResolvedValue(this._state);
    return this._state;
  }

  build(): WarpState {
    return this._state;
  }
}

export function createStateBuilder(): StateBuilder {
  return new StateBuilder();
}
