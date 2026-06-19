/**
 * Reactive subscriptions to graph state changes.
 *
 * 2 methods for push-based change notification.
 */

import type { StateDiffResult } from '../services/state/StateDiff.ts';

/** Options for subscribe(). */
export type SubscribeOptions = {
  onChange: (_diff: StateDiffResult) => void;
  onError?: (_error: unknown) => void; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  replay?: boolean;
};

/** Options for watch(). */
export type WatchOptions = {
  onChange: (_diff: StateDiffResult) => void;
  onError?: (_error: unknown) => void; // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  poll?: number;
};

/** Handle returned by subscribe()/watch(). */
export type SubscriptionHandle = {
  unsubscribe: () => void;
};

export default abstract class SubscriptionCapability {
  /** Subscribe to state diffs, optionally replaying the current state. */
  abstract subscribe(_options: SubscribeOptions): SubscriptionHandle;

  /** Watch matching graph changes with polling behavior. */
  abstract watch(_pattern: string | string[], _options: WatchOptions): SubscriptionHandle;
}
