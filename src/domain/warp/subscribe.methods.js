/**
 * @module domain/warp/subscribe.methods
 *
 * Extracted subscribe, watch, and _notifySubscribers methods from WarpRuntime.
 * Each function is bound to a WarpRuntime instance at runtime via `this`.
 */

import { diffStates, isEmptyDiff } from '../services/StateDiff.js';
import { matchGlob } from '../utils/matchGlob.js';

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
 * Errors thrown by handlers are caught and forwarded to `onError` if provided.
 * One handler's error does not prevent other handlers from being called.
 *
 * @public
 * @since 13.0.0 (stable)
 * @stability stable
 * @this {import('../WarpRuntime.js').default}
 * @param {{ onChange: (diff: import('../services/StateDiff.js').StateDiffResult) => void, onError?: (error: unknown) => void, replay?: boolean }} options - Subscription options
 * @returns {{unsubscribe: () => void}} Subscription handle
 * @throws {Error} If onChange is not a function
 *
 * @example
 * const { unsubscribe } = graph.subscribe({
 *   onChange: (diff) => {
 *     console.log('Nodes added:', diff.nodes.added);
 *     console.log('Nodes removed:', diff.nodes.removed);
 *   },
 *   onError: (err) => console.error('Handler error:', err),
 * });
 *
 * // Later, to stop receiving updates:
 * unsubscribe();
 *
 * @example
 * // With replay: get initial state immediately
 * await graph.materialize();
 * graph.subscribe({
 *   onChange: (diff) => console.log('Initial or changed:', diff),
 *   replay: true, // Immediately fires with current state as additions
 * });
 */
export function subscribe({ onChange, onError, replay = false }) {
  if (typeof onChange !== 'function') {
    throw new Error('onChange must be a function');
  }

  const subscriber = {
    onChange,
    ...(onError !== undefined ? { onError } : {}),
    pendingReplay: replay && !this._cachedState,
  };
  this._subscribers.push(subscriber);

  // Immediate replay if requested and cached state is available
  if (replay && this._cachedState) {
    const diff = diffStates(null, this._cachedState);
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
      const index = this._subscribers.indexOf(subscriber);
      if (index !== -1) {
        this._subscribers.splice(index, 1);
      }
    },
  };
}

/**
 * Watches for graph changes matching a pattern.
 *
 * Like `subscribe()`, but only fires for changes where node IDs match the
 * provided glob pattern. Uses the same pattern syntax as `query().match()`.
 *
 * - Nodes: filters `added` and `removed` to matching IDs
 * - Edges: filters to edges where `from` or `to` matches the pattern
 * - Props: filters to properties where `nodeId` matches the pattern
 *
 * If all changes are filtered out, the handler is not called.
 *
 * When `poll` is set, periodically checks `hasFrontierChanged()` and auto-materializes
 * if the frontier has changed (e.g., remote writes detected). The poll interval must
 * be at least 1000ms.
 *
 * @public
 * @since 13.0.0 (stable)
 * @stability stable
 * @this {import('../WarpRuntime.js').default}
 * @param {string|string[]} pattern - Glob pattern(s) (e.g., 'user:*', 'order:123', '*')
 * @param {{ onChange: (diff: import('../services/StateDiff.js').StateDiffResult) => void, onError?: (error: unknown) => void, poll?: number }} options - Watch options
 * @returns {{unsubscribe: () => void}} Subscription handle
 * @throws {Error} If pattern is not a string or array of strings
 * @throws {Error} If onChange is not a function
 * @throws {Error} If poll is provided but less than 1000
 *
 * @example
 * const { unsubscribe } = graph.watch('user:*', {
 *   onChange: (diff) => {
 *     // Only user node changes arrive here
 *     console.log('User nodes added:', diff.nodes.added);
 *   },
 * });
 *
 * @example
 * // With polling: checks every 5s for remote changes
 * const { unsubscribe } = graph.watch('user:*', {
 *   onChange: (diff) => console.log('User changed:', diff),
 *   poll: 5000,
 * });
 *
 * // Later, to stop receiving updates:
 * unsubscribe();
 */
export function watch(pattern, { onChange, onError, poll }) {
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

  // Pattern matching logic
  /** Tests whether a node ID matches the subscription pattern. @param {string} nodeId @returns {boolean} */
  const matchesPattern = (nodeId) => matchGlob(pattern, nodeId);

  /**
   * Filtered onChange that only passes matching changes.
   * @param {import('../services/StateDiff.js').StateDiffResult} diff
   */
  const filteredOnChange = (diff) => {
    const filteredDiff = {
      nodes: {
        added: diff.nodes.added.filter(matchesPattern),
        removed: diff.nodes.removed.filter(matchesPattern),
      },
      edges: {
        added: diff.edges.added.filter((/** @type {import('../services/StateDiff.js').EdgeChange} */ e) => matchesPattern(e.from) || matchesPattern(e.to)),
        removed: diff.edges.removed.filter((/** @type {import('../services/StateDiff.js').EdgeChange} */ e) => matchesPattern(e.from) || matchesPattern(e.to)),
      },
      props: {
        set: diff.props.set.filter((/** @type {import('../services/StateDiff.js').PropSet} */ p) => matchesPattern(p.nodeId)),
        removed: diff.props.removed.filter((/** @type {import('../services/StateDiff.js').PropRemoved} */ p) => matchesPattern(p.nodeId)),
      },
    };

    // Only call handler if there are matching changes
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

  // Reuse subscription infrastructure
  const subscription = this.subscribe({
    onChange: filteredOnChange,
    ...(onError !== undefined ? { onError } : {}),
  });

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
      this.hasFrontierChanged()
        .then(async (changed) => {
          if (changed) {
            await this.materialize();
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
 * @typedef {Object} Subscriber
 * @property {(diff: import('../services/StateDiff.js').StateDiffResult) => void} onChange
 * @property {((error: unknown) => void)|undefined} [onError]
 * @property {boolean} pendingReplay
 */

/**
 * Notifies all subscribers of state changes.
 * Handles deferred replay for subscribers added with `replay: true` before
 * cached state was available.
 *
 * @this {import('../WarpRuntime.js').default}
 * @param {import('../services/StateDiff.js').StateDiffResult} diff
 * @param {import('../services/JoinReducer.js').WarpStateV5} currentState - The current state for deferred replay
 * @private
 */
export function _notifySubscribers(diff, currentState) {
  for (const subscriber of /** @type {Subscriber[]} */ ([...this._subscribers])) {
    try {
      // Handle deferred replay: on first notification, send full state diff instead
      if (subscriber.pendingReplay) {
        subscriber.pendingReplay = false;
        const replayDiff = diffStates(null, currentState);
        if (!isEmptyDiff(replayDiff)) {
          subscriber.onChange(replayDiff);
        }
      } else {
        // Skip non-replay subscribers when diff is empty
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
