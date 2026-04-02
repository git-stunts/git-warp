/**
 * SubscriptionController — graph change subscription and watch logic.
 *
 * Extracted from subscribe.methods.js. Manages subscriber registration,
 * glob-filtered watches with optional polling, and deferred replay.
 *
 * @module domain/services/SubscriptionController
 */

import { diffStates, isEmptyDiff } from './StateDiff.js';
import { matchGlob } from '../utils/matchGlob.js';

/** @typedef {import('./JoinReducer.js').WarpStateV5} WarpStateV5 */
/** @typedef {import('./StateDiff.js').StateDiffResult} StateDiffResult */
/** @typedef {import('./StateDiff.js').EdgeChange} EdgeChange */
/** @typedef {import('./StateDiff.js').PropSet} PropSet */
/** @typedef {import('./StateDiff.js').PropRemoved} PropRemoved */

/**
 * @typedef {Object} Subscriber
 * @property {(diff: StateDiffResult) => void} onChange
 * @property {((error: unknown) => void)|undefined} [onError]
 * @property {boolean} pendingReplay
 */

/**
 * The host interface that SubscriptionController depends on.
 *
 * @typedef {Object} SubscriptionHost
 * @property {WarpStateV5|null} _cachedState
 * @property {Array<{onChange: Function, onError?: Function, pendingReplay?: boolean}>} _subscribers
 * @property {() => Promise<boolean>} hasFrontierChanged
 * @property {(options?: Record<string, unknown>) => Promise<unknown>} materialize
 */

export default class SubscriptionController {
  /** @type {SubscriptionHost} */
  _host;

  /**
   * Creates a SubscriptionController bound to a WarpRuntime host.
   * @param {SubscriptionHost} host
   */
  constructor(host) {
    this._host = host;
  }

  /**
   * Subscribes to graph changes.
   *
   * The `onChange` handler is called after each `materialize()` that results in
   * state changes. The handler receives a diff object describing what changed.
   *
   * When `replay: true` is set and `_cachedState` is available, immediately
   * fires `onChange` with a diff from empty state to current state. If
   * `_cachedState` is null, replay is deferred until the first materialize.
   *
   * @param {{ onChange: (diff: StateDiffResult) => void, onError?: (error: unknown) => void, replay?: boolean }} options
   * @returns {{ unsubscribe: () => void }}
   */
  subscribe({ onChange, onError, replay = false }) {
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }

    const host = this._host;
    const subscriber = {
      onChange,
      ...(onError !== undefined ? { onError } : {}),
      pendingReplay: replay && !host._cachedState,
    };
    host._subscribers.push(subscriber);

    // Immediate replay if requested and cached state is available
    if (replay && host._cachedState) {
      const diff = diffStates(null, host._cachedState);
      if (!isEmptyDiff(diff)) {
        try {
          onChange(diff);
        } catch (err) {
          if (onError) {
            try {
              onError(/** @type {Error} */ (err));
            } catch {
              // onError itself threw — swallow to prevent cascade
            }
          }
        }
      }
    }

    return {
      /** Removes this subscriber from the notification list. */
      unsubscribe: () => {
        const index = host._subscribers.indexOf(subscriber);
        if (index !== -1) {
          host._subscribers.splice(index, 1);
        }
      },
    };
  }

  /**
   * Watches for graph changes matching a pattern.
   *
   * Like `subscribe()`, but only fires for changes where node IDs match the
   * provided glob pattern. When `poll` is set, periodically checks
   * `hasFrontierChanged()` and auto-materializes if changed.
   *
   * @param {string|string[]} pattern
   * @param {{ onChange: (diff: StateDiffResult) => void, onError?: (error: unknown) => void, poll?: number }} options
   * @returns {{ unsubscribe: () => void }}
   */
  watch(pattern, { onChange, onError, poll }) {
    /** Checks whether a pattern is a non-empty string or array of strings. @param {string|string[]} p @returns {boolean} */
    const isValidPattern = (p) => typeof p === 'string' || (Array.isArray(p) && p.length > 0 && p.every(i => typeof i === 'string'));
    if (!isValidPattern(pattern)) {
      throw new Error('pattern must be a non-empty string or non-empty array of strings');
    }
    if (typeof onChange !== 'function') {
      throw new Error('onChange must be a function');
    }
    if (poll !== undefined) {
      if (typeof poll !== 'number' || !Number.isFinite(poll) || poll < 1000) {
        throw new Error('poll must be a finite number >= 1000');
      }
    }

    /** Tests whether a node ID matches the subscription pattern. @param {string} nodeId @returns {boolean} */
    const matchesPattern = (nodeId) => matchGlob(pattern, nodeId);

    /**
     * Filtered onChange that only passes matching changes.
     * @param {StateDiffResult} diff
     */
    const filteredOnChange = (diff) => {
      const filteredDiff = {
        nodes: {
          added: diff.nodes.added.filter(matchesPattern),
          removed: diff.nodes.removed.filter(matchesPattern),
        },
        edges: {
          added: diff.edges.added.filter((/** @type {EdgeChange} */ e) => matchesPattern(e.from) || matchesPattern(e.to)),
          removed: diff.edges.removed.filter((/** @type {EdgeChange} */ e) => matchesPattern(e.from) || matchesPattern(e.to)),
        },
        props: {
          set: diff.props.set.filter((/** @type {PropSet} */ p) => matchesPattern(p.nodeId)),
          removed: diff.props.removed.filter((/** @type {PropRemoved} */ p) => matchesPattern(p.nodeId)),
        },
      };

      const hasChanges =
        filteredDiff.nodes.added.length > 0 ||
        filteredDiff.nodes.removed.length > 0 ||
        filteredDiff.edges.added.length > 0 ||
        filteredDiff.edges.removed.length > 0 ||
        filteredDiff.props.set.length > 0 ||
        filteredDiff.props.removed.length > 0;

      if (hasChanges) {
        onChange(filteredDiff);
      }
    };

    // Reuse own subscription infrastructure
    const subscription = this.subscribe({
      onChange: filteredOnChange,
      ...(onError !== undefined ? { onError } : {}),
    });

    const host = this._host;

    // Polling: periodically check frontier and auto-materialize if changed
    /** @type {ReturnType<typeof setInterval>|null} */
    let pollIntervalId = null;
    let pollInFlight = false;
    if (poll !== undefined) {
      pollIntervalId = setInterval(() => {
        if (pollInFlight) {
          return;
        }
        pollInFlight = true;
        host.hasFrontierChanged()
          .then(async (changed) => {
            if (changed) {
              await host.materialize();
            }
          })
          .catch((err) => {
            if (onError) {
              try {
                onError(err);
              } catch {
                // onError itself threw — swallow to prevent cascade
              }
            }
          })
          .finally(() => {
            pollInFlight = false;
          });
      }, poll);
    }

    return {
      /** Stops polling and removes the filtered subscriber. */
      unsubscribe: () => {
        if (pollIntervalId !== null) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        subscription.unsubscribe();
      },
    };
  }

  /**
   * Notifies all subscribers of state changes.
   * Handles deferred replay for subscribers added with `replay: true` before
   * cached state was available.
   *
   * @param {StateDiffResult} diff
   * @param {WarpStateV5} currentState
   */
  _notifySubscribers(diff, currentState) {
    for (const subscriber of /** @type {Subscriber[]} */ ([...this._host._subscribers])) {
      try {
        if (subscriber.pendingReplay) {
          subscriber.pendingReplay = false;
          const replayDiff = diffStates(null, currentState);
          if (!isEmptyDiff(replayDiff)) {
            subscriber.onChange(replayDiff);
          }
        } else {
          if (isEmptyDiff(diff)) {
            continue;
          }
          subscriber.onChange(diff);
        }
      } catch (err) {
        if (typeof subscriber.onError === 'function') {
          try {
            subscriber.onError(err);
          } catch {
            // onError itself threw — swallow to prevent cascade
          }
        }
      }
    }
  }
}
