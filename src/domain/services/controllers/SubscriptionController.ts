/**
 * SubscriptionController — graph change subscription and watch logic.
 *
 * Extracted from subscribe.methods.js. Manages subscriber registration,
 * glob-filtered watches with optional polling, and deferred replay.
 *
 * @module domain/services/controllers/SubscriptionController
 */

import { diffStates, isEmptyDiff, type StateDiffResult, type EdgeChange, type PropSet, type PropRemoved } from '../state/StateDiff.ts';
import { matchGlob } from '../../utils/matchGlob.ts';
import WarpError from '../../errors/WarpError.ts';
import type { WarpState } from '../JoinReducer.ts';

/**
 * Callback shape for subscriber errors. Errors flow through the catch
 * binding and land here as `Error` — both WarpError (domain) and raw
 * Error instances propagated from infrastructure callbacks surface as
 * Error subtypes.
 */
export type SubscriberErrorHandler = (error: Error) => void;

/**
 * Change callback shape shared by `subscribe()` and `watch()`.
 */
export type SubscriberChangeHandler = (diff: StateDiffResult) => void;

interface Subscriber {
  onChange: SubscriberChangeHandler;
  onError?: SubscriberErrorHandler;
  pendingReplay: boolean;
}

interface SubscriptionHost {
  _cachedState: WarpState | null;
  _subscribers: Array<{
    onChange: SubscriberChangeHandler;
    onError?: SubscriberErrorHandler;
    pendingReplay?: boolean;
  }>;
  hasFrontierChanged(): Promise<boolean>;
  _materializeGraph(): Promise<SubscriptionMaterializedState>;
}

type SubscriptionMaterializedState = {
  state: WarpState;
};


type SchedulerFn = (callback: () => void, ms: number) => ReturnType<typeof setInterval>;

export default class SubscriptionController {
  _host: SubscriptionHost;
  private readonly _scheduler: SchedulerFn | null;

  constructor(host: SubscriptionHost, options?: { scheduler?: SchedulerFn }) {
    this._host = host;
    this._scheduler = options?.scheduler ?? null;
  }

  /** Returns the scheduler, falling back to globalThis.setInterval at call time. */
  private _resolveScheduler(): SchedulerFn {
    return this._scheduler ?? globalThis.setInterval.bind(globalThis);
  }

  subscribe({ onChange, onError, replay = false }: {
    onChange: SubscriberChangeHandler;
    onError?: SubscriberErrorHandler;
    replay?: boolean;
  }): { unsubscribe: () => void } {
    if (typeof onChange !== 'function') {
      throw new WarpError('onChange must be a function', 'E_SUBSCRIBE_INVALID_CALLBACK');
    }

    const host = this._host;
    const subscriber: Subscriber = {
      onChange,
      ...(onError !== undefined ? { onError } : {}),
      pendingReplay: replay && !host._cachedState,
    };
    host._subscribers.push(subscriber);

    if (replay && host._cachedState) {
      const diff = diffStates(null, host._cachedState);
      if (!isEmptyDiff(diff)) {
        try {
          onChange(diff);
        } catch (err) {
          if (onError) {
            try {
              onError(err instanceof Error ? err : new WarpError(String(err), 'E_SUBSCRIBE_NON_ERROR'));
            } catch {
              // onError itself threw — swallow to prevent cascade
            }
          }
        }
      }
    }

    return {
      unsubscribe: () => {
        const index = host._subscribers.indexOf(subscriber);
        if (index !== -1) {
          host._subscribers.splice(index, 1);
        }
      },
    };
  }

  watch(
    pattern: string | string[],
    { onChange, onError, poll }: {
      onChange: SubscriberChangeHandler;
      onError?: SubscriberErrorHandler;
      poll?: number;
    },
  ): { unsubscribe: () => void } {
    const isValidPattern = (p: string | string[]): boolean =>
      typeof p === 'string' || (Array.isArray(p) && p.length > 0 && p.every(i => typeof i === 'string'));

    if (!isValidPattern(pattern)) {
      throw new WarpError(
        'pattern must be a non-empty string or non-empty array of strings',
        'E_WATCH_INVALID_PATTERN',
      );
    }
    if (typeof onChange !== 'function') {
      throw new WarpError('onChange must be a function', 'E_WATCH_INVALID_CALLBACK');
    }
    if (poll !== undefined) {
      if (typeof poll !== 'number' || !Number.isFinite(poll) || poll < 1000) {
        throw new WarpError('poll must be a finite number >= 1000', 'E_WATCH_INVALID_POLL');
      }
    }

    const matchesPattern = (nodeId: string): boolean => matchGlob(pattern, nodeId);

    const filteredOnChange = (diff: StateDiffResult): void => {
      const filteredDiff: StateDiffResult = {
        nodes: {
          added: diff.nodes.added.filter(matchesPattern),
          removed: diff.nodes.removed.filter(matchesPattern),
        },
        edges: {
          added: diff.edges.added.filter((e: EdgeChange) => matchesPattern(e.from) || matchesPattern(e.to)),
          removed: diff.edges.removed.filter((e: EdgeChange) => matchesPattern(e.from) || matchesPattern(e.to)),
        },
        props: {
          set: diff.props.set.filter((p: PropSet) => matchesPattern(p.nodeId)),
          removed: diff.props.removed.filter((p: PropRemoved) => matchesPattern(p.nodeId)),
        },
      };

      const hasChanges =
        filteredDiff.nodes.added.length > 0 ||
        filteredDiff.nodes.removed.length > 0 ||
        filteredDiff.edges.added.length > 0 ||
        filteredDiff.edges.removed.length > 0 ||
        filteredDiff.props.set.length > 0 ||
        filteredDiff.props.removed.length > 0;

      if (hasChanges) { onChange(filteredDiff); }
    };

    const subscription = this.subscribe({
      onChange: filteredOnChange,
      ...(onError !== undefined ? { onError } : {}),
    });

    const host = this._host;

    let pollIntervalId: ReturnType<typeof setInterval> | null = null;
    let pollInFlight = false;
    if (poll !== undefined) {
      pollIntervalId = this._resolveScheduler()(() => {
        if (pollInFlight) { return; }
        pollInFlight = true;
        host.hasFrontierChanged()
          .then(async (changed) => {
            if (changed) { await host._materializeGraph(); }
          })
          .catch((err) => {
            if (onError) {
              try {
                onError(err instanceof Error ? err : new WarpError(String(err), 'E_SUBSCRIBE_NON_ERROR'));
              } catch {
                // onError itself threw — swallow
              }
            }
          })
          .finally(() => {
            pollInFlight = false;
          });
      }, poll);
    }

    return {
      unsubscribe: () => {
        if (pollIntervalId !== null) {
          clearInterval(pollIntervalId);
          pollIntervalId = null;
        }
        subscription.unsubscribe();
      },
    };
  }

  _notifySubscribers(diff: StateDiffResult, currentState: WarpState): void {
    for (const subscriber of [...this._host._subscribers] as Subscriber[]) {
      try {
        if (subscriber.pendingReplay) {
          subscriber.pendingReplay = false;
          const replayDiff = diffStates(null, currentState);
          if (!isEmptyDiff(replayDiff)) {
            subscriber.onChange(replayDiff);
          }
        } else {
          if (isEmptyDiff(diff)) { continue; }
          subscriber.onChange(diff);
        }
      } catch (err) {
        if (typeof subscriber.onError === 'function') {
          try {
            subscriber.onError(err instanceof Error ? err : new WarpError(String(err), 'E_SUBSCRIBE_NON_ERROR'));
          } catch {
            // onError itself threw — swallow
          }
        }
      }
    }
  }
}
