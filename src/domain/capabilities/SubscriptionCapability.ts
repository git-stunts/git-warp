/**
 * Reactive subscriptions to graph state changes.
 *
 * 2 methods for push-based change notification.
 */

import type { StateDiffResult } from '../services/state/StateDiff.js';

/** Options for subscribe(). */
export type SubscribeOptions = {
  onChange: (_diff: StateDiffResult) => void;
  onError?: (_error: unknown) => void;
  replay?: boolean;
};

/** Options for watch(). */
export type WatchOptions = {
  onChange: (_diff: StateDiffResult) => void;
  onError?: (_error: unknown) => void;
  poll?: number;
};

/** Handle returned by subscribe()/watch(). */
export type SubscriptionHandle = {
  unsubscribe: () => void;
};

export default abstract class SubscriptionCapability {
  abstract subscribe(_options: SubscribeOptions): SubscriptionHandle;
  abstract watch(_pattern: string | string[], _options: WatchOptions): SubscriptionHandle;
}
