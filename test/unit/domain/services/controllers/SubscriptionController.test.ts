/**
 * @fileoverview SubscriptionController — unit tests.
 *
 * Covers subscribe(), watch(), and _notifySubscribers() behavior:
 * registration, validation, replay (immediate and deferred), glob filtering,
 * polling lifecycle, error handling, and unsubscribe cleanup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import SubscriptionController from '../../../../../src/domain/services/controllers/SubscriptionController.ts';

// Mock StateDiff — we test SubscriptionController logic, not diff computation
vi.mock('../../../../../src/domain/services/state/StateDiff.ts', () => ({
  diffStates: vi.fn(),
  isEmptyDiff: vi.fn(),
}));

import { diffStates, isEmptyDiff } from '../../../../../src/domain/services/state/StateDiff.ts';

// Cast mocked functions so .mockImplementation/.mockReturnValue are available
const mockDiffStates = (diffStates as any);
const mockIsEmptyDiff = (isEmptyDiff as any);

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Creates a diff object with sensible defaults.
 * @param {{
 *   nodesAdded?: string[];
 *   nodesRemoved?: string[];
 *   edgesAdded?: import('../../../../../src/domain/services/state/StateDiff.ts').EdgeChange[];
 *   edgesRemoved?: import('../../../../../src/domain/services/state/StateDiff.ts').EdgeChange[];
 *   propsSet?: import('../../../../../src/domain/services/state/StateDiff.ts').PropSet[];
 *   propsRemoved?: import('../../../../../src/domain/services/state/StateDiff.ts').PropRemoved[];
 * }} [opts]
 */
function makeDiff({ nodesAdded = [] as any[], nodesRemoved = [] as any[], edgesAdded = [] as any[], edgesRemoved = [] as any[], propsSet = [] as any[], propsRemoved = [] as any[] } = {}) {
  return {
    nodes: { added: nodesAdded, removed: nodesRemoved },
    edges: { added: edgesAdded, removed: edgesRemoved },
    props: { set: propsSet, removed: propsRemoved },
  };
}

/** Creates an empty diff. */
function emptyDiff() {
  return makeDiff();
}

/** Sentinel state object — content irrelevant since diffStates is mocked. */
function fakeState() {
  return ({ nodeAlive: 'mock', edgeAlive: 'mock', prop: 'mock', observedFrontier: 'mock' } as any);
}

/** Creates a mock host for SubscriptionController. */
function createHost({ cachedState = null } = {}) {
  return {
    _cachedState: (cachedState),
    _subscribers: ([] as any[]),
    hasFrontierChanged: vi.fn().mockResolvedValue(false),
    _materializeGraph: vi.fn().mockRejectedValue(new Error('hidden materialization trap')),
  };
}

/**
 * Creates a timer-backed scheduler for controller polling tests.
 */
function createTimerScheduler() {
  return {
    scheduleEvery(callback: () => void, ms: number) {
      const id = globalThis.setInterval(callback, ms);
      return {
        cancel: () => {
          globalThis.clearInterval(id);
        },
      };
    },
  };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe('SubscriptionController', () => {
    let host;
    let ctrl;
    let scheduler;

  beforeEach(() => {
    vi.clearAllMocks();
    host = createHost();
    scheduler = createTimerScheduler();
    ctrl = new SubscriptionController((host), { scheduler });
    // Default: isEmptyDiff returns true for empty diffs, false for non-empty
    mockIsEmptyDiff.mockImplementation((/** @type {any} */ d) =>
      d.nodes.added.length === 0 &&
      d.nodes.removed.length === 0 &&
      d.edges.added.length === 0 &&
      d.edges.removed.length === 0 &&
      d.props.set.length === 0 &&
      d.props.removed.length === 0
    );
  });

  // ── subscribe() ───────────────────────────────────────────────────────

  describe('subscribe()', () => {
    it('registers a subscriber in the host list', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange });

      expect(host._subscribers).toHaveLength(1);
      expect(host._subscribers[0]?.onChange).toBe(onChange);
    });

    it('throws when onChange is not a function', () => {
      expect(() => ctrl.subscribe({ onChange: ('not-a-fn' as any) })).toThrow('onChange must be a function');
      expect(() => ctrl.subscribe({ onChange: (null) })).toThrow('onChange must be a function');
      expect(() => ctrl.subscribe({ onChange: (undefined) })).toThrow('onChange must be a function');
    });

    it('returns an unsubscribe handle that removes the subscriber', () => {
      const onChange = vi.fn();
      const { unsubscribe } = ctrl.subscribe({ onChange });

      expect(host._subscribers).toHaveLength(1);
      unsubscribe();
      expect(host._subscribers).toHaveLength(0);
    });

    it('unsubscribe is idempotent', () => {
      const onChange = vi.fn();
      const { unsubscribe } = ctrl.subscribe({ onChange });

      unsubscribe();
      unsubscribe();
      expect(host._subscribers).toHaveLength(0);
    });

    it('replay fires immediately when cached state is available', () => {
      const state = fakeState();
      host._cachedState = state;
      const replayDiff = makeDiff({ nodesAdded: ['node:a', 'node:b'] });
      mockDiffStates.mockReturnValue(replayDiff);

      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: true });

      expect(mockDiffStates).toHaveBeenCalledWith(null, state);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(replayDiff);
    });

    it('replay is deferred (pendingReplay=true) when no cached state', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: true });

      expect(onChange).not.toHaveBeenCalled();
      expect(host._subscribers[0]?.pendingReplay).toBe(true);
    });

    it('replay=false does not set pendingReplay', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: false });

      expect(host._subscribers[0]?.pendingReplay).toBe(false);
    });

    it('replay with empty diff from cached state does not fire onChange', () => {
      host._cachedState = fakeState();
      mockDiffStates.mockReturnValue(emptyDiff());

      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: true });

      expect(onChange).not.toHaveBeenCalled();
    });

    it('calls onError when onChange throws during replay', () => {
      host._cachedState = fakeState();
      const replayDiff = makeDiff({ nodesAdded: ['x'] });
      mockDiffStates.mockReturnValue(replayDiff);

      const replayError = new Error('boom');
      const onChange = vi.fn().mockImplementation(() => { throw replayError; });
      const onError = vi.fn();

      ctrl.subscribe({ onChange, onError, replay: true });

      expect(onError).toHaveBeenCalledWith(replayError);
    });

    it('swallows onError throw during replay without cascading', () => {
      host._cachedState = fakeState();
      mockDiffStates.mockReturnValue(makeDiff({ nodesAdded: ['x'] }));

      const onChange = vi.fn().mockImplementation(() => { throw new Error('onChange boom'); });
      const onError = vi.fn().mockImplementation(() => { throw new Error('onError boom'); });

      expect(() => ctrl.subscribe({ onChange, onError, replay: true })).not.toThrow();
    });

    it('does not call onError if onChange succeeds during replay', () => {
      host._cachedState = fakeState();
      mockDiffStates.mockReturnValue(makeDiff({ nodesAdded: ['x'] }));

      const onChange = vi.fn();
      const onError = vi.fn();
      ctrl.subscribe({ onChange, onError, replay: true });

      expect(onError).not.toHaveBeenCalled();
    });

    it('does not include onError on subscriber when not provided', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange });

      expect(host._subscribers[0]).not.toHaveProperty('onError');
    });

    it('includes onError on subscriber when provided', () => {
      const onChange = vi.fn();
      const onError = vi.fn();
      ctrl.subscribe({ onChange, onError });

      expect(host._subscribers[0]?.onError).toBe(onError);
    });
  });

  // ── watch() ───────────────────────────────────────────────────────────

  describe('watch()', () => {
    describe('validation', () => {
      it('accepts a string pattern', () => {
        expect(() => ctrl.watch('user:*', { onChange: vi.fn() })).not.toThrow();
      });

      it('accepts an array of string patterns', () => {
        expect(() => ctrl.watch(['user:*', 'org:*'], { onChange: vi.fn() })).not.toThrow();
      });

      it('rejects empty array', () => {
        expect(() => ctrl.watch([], { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
      });

      it('rejects non-string, non-array values', () => {
        expect(() => ctrl.watch((42 as any), { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
        expect(() => ctrl.watch((null), { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
        expect(() => ctrl.watch((undefined), { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
      });

      it('rejects array with non-string elements', () => {
        expect(() => ctrl.watch(([42] as any), { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
        expect(() => ctrl.watch((['ok', 42] as any), { onChange: vi.fn() })).toThrow('pattern must be a non-empty string');
      });

      it('throws when onChange is not a function', () => {
        expect(() => ctrl.watch('*', { onChange: ('nope' as any) })).toThrow('onChange must be a function');
      });

      it('throws when poll is less than 1000', () => {
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: 999 })).toThrow('poll must be a finite number >= 1000');
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: 0 })).toThrow('poll must be a finite number >= 1000');
      });

      it('throws when poll is not a number', () => {
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: ('5000' as any) })).toThrow('poll must be a finite number >= 1000');
      });

      it('throws when poll is NaN', () => {
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: NaN })).toThrow('poll must be a finite number >= 1000');
      });

      it('throws when poll is Infinity', () => {
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: Infinity })).toThrow('poll must be a finite number >= 1000');
      });

      it('throws when poll is requested without an injected scheduler', () => {
        const noSchedulerCtrl = new SubscriptionController((host));
        expect(() => noSchedulerCtrl.watch('*', { onChange: vi.fn(), poll: 1000 }))
          .toThrow('poll requires an injected scheduler');
        expect(host._subscribers).toHaveLength(0);
      });

      it('accepts poll exactly 1000', () => {
        vi.useFakeTimers();
        expect(() => ctrl.watch('*', { onChange: vi.fn(), poll: 1000 })).not.toThrow();
        vi.useRealTimers();
      });

      it('accepts an empty string pattern (matches only empty-string node IDs)', () => {
        // Empty string is a valid non-empty-type string; isValidPattern returns true
        expect(() => ctrl.watch('', { onChange: vi.fn() })).not.toThrow();
      });
    });

    describe('glob filtering', () => {
      it('filters nodes by glob pattern', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          nodesAdded: ['user:alice', 'org:acme', 'user:bob'],
        });
        // _notifySubscribers calls the filtered onChange registered by watch
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.nodes.added).toEqual(['user:alice', 'user:bob']);
        expect(filtered.nodes.removed).toEqual([]);
      });

      it('filters edges where either endpoint matches', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          edgesAdded: [
            { from: 'user:alice', to: 'org:acme', label: 'member' },
            { from: 'org:acme', to: 'org:other', label: 'partner' },
            { from: 'org:x', to: 'user:bob', label: 'owns' },
          ],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.edges.added).toHaveLength(2);
        expect(filtered.edges.added[0].from).toBe('user:alice');
        expect(filtered.edges.added[1].to).toBe('user:bob');
      });

      it('filters props by nodeId', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          propsSet: [
            { key: 'k1', nodeId: 'user:alice', propKey: 'name', oldValue: undefined, newValue: 'Alice' },
            { key: 'k2', nodeId: 'org:acme', propKey: 'name', oldValue: undefined, newValue: 'Acme' },
          ],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.props.set).toHaveLength(1);
        expect(filtered.props.set[0].nodeId).toBe('user:alice');
      });

      it('filters removed props by nodeId', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          propsRemoved: [
            { key: 'k1', nodeId: 'user:alice', propKey: 'name', oldValue: 'Alice' },
            { key: 'k2', nodeId: 'org:acme', propKey: 'name', oldValue: 'Acme' },
          ],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.props.removed).toHaveLength(1);
        expect(filtered.props.removed[0].nodeId).toBe('user:alice');
      });

      it('does not fire onChange when no changes match the pattern', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({ nodesAdded: ['org:acme'] });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).not.toHaveBeenCalled();
      });

      it('supports array of patterns (OR semantics)', () => {
        const onChange = vi.fn();
        ctrl.watch(['user:*', 'org:*'], { onChange });

        const diff = makeDiff({
          nodesAdded: ['user:alice', 'org:acme', 'device:phone'],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.nodes.added).toEqual(['user:alice', 'org:acme']);
      });

      it('passes through removed nodes that match', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          nodesRemoved: ['user:alice', 'org:acme'],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.nodes.removed).toEqual(['user:alice']);
      });

      it('passes through removed edges that match', () => {
        const onChange = vi.fn();
        ctrl.watch('user:*', { onChange });

        const diff = makeDiff({
          edgesRemoved: [
            { from: 'user:alice', to: 'org:acme', label: 'member' },
            { from: 'org:a', to: 'org:b', label: 'link' },
          ],
        });
        ctrl._notifySubscribers((diff), fakeState());

        expect(onChange).toHaveBeenCalledTimes(1);
        const filtered = onChange.mock.calls[0]?.[0];
        expect(filtered.edges.removed).toHaveLength(1);
        expect(filtered.edges.removed[0].from).toBe('user:alice');
      });
    });

    describe('polling', () => {
      beforeEach(() => {
        vi.useFakeTimers();
      });

      afterEach(() => {
        vi.useRealTimers();
      });

      it('reports stale reading basis when frontier changes without materializing', async () => {
        host.hasFrontierChanged.mockResolvedValue(true);
        const onError = vi.fn();

        ctrl.watch('*', { onChange: vi.fn(), onError, poll: 2000 });

        await vi.advanceTimersByTimeAsync(2000);

        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);
        expect(host._materializeGraph).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_STALE_STATE' }));
      });

      it('does not report stale reading basis when frontier has not changed', async () => {
        host.hasFrontierChanged.mockResolvedValue(false);
        const onError = vi.fn();

        ctrl.watch('*', { onChange: vi.fn(), onError, poll: 2000 });

        await vi.advanceTimersByTimeAsync(2000);

        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);
        expect(host._materializeGraph).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
      });

      it('guards against overlapping polls (in-flight lock)', async () => {
                let resolveFirst;
        host.hasFrontierChanged.mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }));

        ctrl.watch('*', { onChange: vi.fn(), poll: 1000 });

        // First tick fires
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);

        // Second tick fires but first is still in-flight — skipped
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);

        // Resolve the first, then the next tick should fire
        if (resolveFirst) { resolveFirst(false); }
        await vi.advanceTimersByTimeAsync(1);

        host.hasFrontierChanged.mockResolvedValue(false);
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(2);
      });

      it('calls onError when hasFrontierChanged rejects', async () => {
        const pollError = new Error('poll failed');
        host.hasFrontierChanged.mockRejectedValue(pollError);
        const onError = vi.fn();

        ctrl.watch('*', { onChange: vi.fn(), onError, poll: 2000 });

        await vi.advanceTimersByTimeAsync(2000);

        expect(onError).toHaveBeenCalledWith(pollError);
      });

      it('continues polling after stale reading basis error', async () => {
        host.hasFrontierChanged.mockResolvedValue(true);
        const onError = vi.fn();

        ctrl.watch('*', { onChange: vi.fn(), onError, poll: 1000 });

        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'E_STALE_STATE' }));

        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(2);
        expect(onError).toHaveBeenCalledTimes(2);
      });

      it('swallows onError throw during poll without cascading', async () => {
        host.hasFrontierChanged.mockRejectedValue(new Error('poll fail'));
        const onError = vi.fn().mockImplementation(() => { throw new Error('onError boom'); });

        ctrl.watch('*', { onChange: vi.fn(), onError, poll: 2000 });

        // Should not cause unhandled rejection
        await vi.advanceTimersByTimeAsync(2000);
      });

      it('resets in-flight flag after error so next poll fires', async () => {
        host.hasFrontierChanged
          .mockRejectedValueOnce(new Error('transient'))
          .mockResolvedValue(false);

        ctrl.watch('*', { onChange: vi.fn(), onError: vi.fn(), poll: 1000 });

        // First poll — errors
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(1);

        // Second poll — should fire (in-flight reset via .finally)
        await vi.advanceTimersByTimeAsync(1000);
        expect(host.hasFrontierChanged).toHaveBeenCalledTimes(2);
      });

      it('unsubscribe clears the polling interval', async () => {
        host.hasFrontierChanged.mockResolvedValue(true);

        const { unsubscribe } = ctrl.watch('*', { onChange: vi.fn(), poll: 2000 });
        unsubscribe();

        await vi.advanceTimersByTimeAsync(4000);

        expect(host.hasFrontierChanged).not.toHaveBeenCalled();
      });

      it('unsubscribe also removes the subscriber', () => {
        const { unsubscribe } = ctrl.watch('*', { onChange: vi.fn(), poll: 2000 });

        expect(host._subscribers).toHaveLength(1);
        unsubscribe();
        expect(host._subscribers).toHaveLength(0);
      });

      it('unsubscribe is idempotent for watch', () => {
        const { unsubscribe } = ctrl.watch('*', { onChange: vi.fn(), poll: 2000 });

        unsubscribe();
        unsubscribe();
        expect(host._subscribers).toHaveLength(0);
      });
    });

    it('registers a subscriber without polling when poll is not set', () => {
      ctrl.watch('*', { onChange: vi.fn() });

      expect(host._subscribers).toHaveLength(1);
    });
  });

  // ── _notifySubscribers() ──────────────────────────────────────────────

  describe('_notifySubscribers()', () => {
    it('calls onChange for each subscriber with the diff', () => {
      const onChange1 = vi.fn();
      const onChange2 = vi.fn();
      ctrl.subscribe({ onChange: onChange1 });
      ctrl.subscribe({ onChange: onChange2 });

      const diff = makeDiff({ nodesAdded: ['a'] });
      ctrl._notifySubscribers((diff), fakeState());

      expect(onChange1).toHaveBeenCalledWith(diff);
      expect(onChange2).toHaveBeenCalledWith(diff);
    });

    it('skips subscribers when diff is empty', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange });

      ctrl._notifySubscribers((emptyDiff() as any), fakeState());

      expect(onChange).not.toHaveBeenCalled();
    });

    it('delivers deferred replay (pendingReplay) with full state diff', () => {
      // Subscribe with replay but no cached state -> deferred
      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: true });

      expect(host._subscribers[0]?.pendingReplay).toBe(true);

      // Mock diffStates to return a non-empty diff for the deferred replay
      const replayDiff = makeDiff({ nodesAdded: ['node:x', 'node:y'] });
      mockDiffStates.mockReturnValue(replayDiff);

      const currentState = fakeState();
      ctrl._notifySubscribers((emptyDiff() as any), currentState);

      expect(mockDiffStates).toHaveBeenCalledWith(null, currentState);
      expect(onChange).toHaveBeenCalledTimes(1);
      expect(onChange).toHaveBeenCalledWith(replayDiff);

      // pendingReplay should be cleared
      expect(host._subscribers[0]?.pendingReplay).toBe(false);
    });

    it('clears pendingReplay even if deferred replay produces empty diff', () => {
      const onChange = vi.fn();
      ctrl.subscribe({ onChange, replay: true });

      mockDiffStates.mockReturnValue(emptyDiff());

      ctrl._notifySubscribers((emptyDiff() as any), fakeState());

      expect(onChange).not.toHaveBeenCalled();
      expect(host._subscribers[0]?.pendingReplay).toBe(false);
    });

    it('calls onError when onChange throws', () => {
      const err = new Error('handler boom');
      const onChange = vi.fn().mockImplementation(() => { throw err; });
      const onError = vi.fn();
      ctrl.subscribe({ onChange, onError });

      const diff = makeDiff({ nodesAdded: ['a'] });
      ctrl._notifySubscribers((diff), fakeState());

      expect(onError).toHaveBeenCalledWith(err);
    });

    it('swallows onError throw without cascading to other subscribers', () => {
      const onChange1 = vi.fn().mockImplementation(() => { throw new Error('boom1'); });
      const onError1 = vi.fn().mockImplementation(() => { throw new Error('onError boom'); });
      const onChange2 = vi.fn();
      ctrl.subscribe({ onChange: onChange1, onError: onError1 });
      ctrl.subscribe({ onChange: onChange2 });

      const diff = makeDiff({ nodesAdded: ['a'] });
      ctrl._notifySubscribers((diff), fakeState());

      // Second subscriber still gets notified
      expect(onChange2).toHaveBeenCalledWith(diff);
    });

    it('does not throw when onChange throws and no onError is provided', () => {
      const onChange = vi.fn().mockImplementation(() => { throw new Error('boom'); });
      ctrl.subscribe({ onChange });

      const diff = makeDiff({ nodesAdded: ['a'] });
      expect(() => ctrl._notifySubscribers((diff), fakeState())).not.toThrow();
    });

    it('iterates over a snapshot of subscribers (safe against mid-iteration unsubscribe)', () => {
            const calls = ([]) as string[];
            let unsub2;
      const onChange1 = vi.fn().mockImplementation(() => {
        calls.push('first');
        if (unsub2) { unsub2(); }
      });
      const onChange2 = vi.fn().mockImplementation(() => {
        calls.push('second');
      });

      ctrl.subscribe({ onChange: onChange1 });
      const sub2 = ctrl.subscribe({ onChange: onChange2 });
      unsub2 = sub2.unsubscribe;

      const diff = makeDiff({ nodesAdded: ['a'] });
      ctrl._notifySubscribers((diff), fakeState());

      // Both called because _notifySubscribers spreads the array first
      expect(calls).toEqual(['first', 'second']);
    });

    it('calls onError during deferred replay when onChange throws', () => {
      const err = new Error('replay handler boom');
      const onChange = vi.fn().mockImplementation(() => { throw err; });
      const onError = vi.fn();
      ctrl.subscribe({ onChange, onError, replay: true });

      mockDiffStates.mockReturnValue(makeDiff({ nodesAdded: ['x'] }));
      ctrl._notifySubscribers((emptyDiff() as any), fakeState());

      expect(onError).toHaveBeenCalledWith(err);
    });
  });
});
