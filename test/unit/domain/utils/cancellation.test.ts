import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import OperationAbortedError from '../../../../src/domain/errors/OperationAbortedError.ts';
import { checkAborted as _checkAborted, createTimeoutSignal } from '../../../../src/domain/utils/cancellation.ts';

const checkAborted = (_checkAborted) as any;

// AbortSignal.timeout() runs on Node's internal timers, which Vitest fake
// timers cannot reach. This installs fake timers and replaces it with an
// equivalent signal on the faked global timer, so time moves only when a test
// advances it.
function installFakeTimeoutSignal(): void {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
    const controller = new AbortController();
    fakeAbortAfter(controller, ms);
    return controller.signal;
  });
}

function fakeAbortAfter(controller: AbortController, ms: number): void {
  // eslint-disable-next-line no-restricted-syntax -- fake timers: callers install vi.useFakeTimers() first
  setTimeout(() => controller.abort(), ms);
}

function fakeSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    // eslint-disable-next-line no-restricted-syntax -- fake timers: callers install vi.useFakeTimers() first
    setTimeout(resolve, ms);
  });
}

describe('Cancellation', () => {
  describe('OperationAbortedError', () => {
    it('constructs with operation name and default message', () => {
      const error = new OperationAbortedError('traversal');

      expect(error.name).toBe('OperationAbortedError');
      expect(error.operation).toBe('traversal');
      expect(error.message).toBe("Operation 'traversal' aborted: Operation was aborted");
      expect(error.code).toBe('OPERATION_ABORTED');
      expect(error.reason).toBe('Operation was aborted');
      expect(error.context).toEqual({});
    });

    it('constructs with custom reason', () => {
      const error = new OperationAbortedError('rebuild', {
        reason: 'Signal received',
      });

      expect(error.message).toBe("Operation 'rebuild' aborted: Signal received");
      expect(error.reason).toBe('Signal received');
    });

    it('constructs with custom code', () => {
      const error = new OperationAbortedError('indexing', {
        code: 'TIMEOUT_EXCEEDED',
      });

      expect(error.code).toBe('TIMEOUT_EXCEEDED');
    });

    it('constructs with context object', () => {
      const context = { visitedCount: 42, lastSha: 'abc123' };
      const error = new OperationAbortedError('traversal', { context });

      expect(error.context).toEqual(context);
      expect(error.context['visitedCount']).toBe(42);
      expect(error.context['lastSha']).toBe('abc123');
    });

    it('is an instance of Error', () => {
      const error = new OperationAbortedError('test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(OperationAbortedError);
    });

    it('has a stack trace', () => {
      const error = new OperationAbortedError('test');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('OperationAbortedError');
    });
  });

  describe('checkAborted', () => {
    it('throws OperationAbortedError when signal.aborted is true', () => {
      const controller = new AbortController();
      controller.abort();

      expect(() => checkAborted(controller.signal, 'test-operation')).toThrow(
        OperationAbortedError
      );
    });

    it('throws with operation name in message when signal is aborted', () => {
      const controller = new AbortController();
      controller.abort();

      expect(() => checkAborted(controller.signal, 'traversal')).toThrow(
        /traversal.*was aborted/
      );
    });

    it('includes operation in context when throwing', () => {
      const controller = new AbortController();
      controller.abort();

      try {
        checkAborted(controller.signal, 'rebuild');
        expect.fail('Should have thrown');
      } catch (/** @type {any} */ err) {
        expect((err as any).context.operation).toBe('rebuild');
      }
    });

    it('does nothing when signal is undefined', () => {
      expect(() => checkAborted(undefined, 'test')).not.toThrow();
    });

    it('does nothing when signal is null', () => {
      expect(() => checkAborted(null, 'test')).not.toThrow();
    });

    it('does nothing when signal.aborted is false', () => {
      const controller = new AbortController();
      // Not aborted

      expect(() => checkAborted(controller.signal, 'test')).not.toThrow();
    });

    it('throws generic message when operation is not provided', () => {
      const controller = new AbortController();
      controller.abort();

      try {
        checkAborted(controller.signal);
        expect.fail('Should have thrown');
      } catch (/** @type {any} */ err) {
        expect((err as any).message).toContain('Operation was aborted');
      }
    });
  });

  describe('createTimeoutSignal', () => {
    beforeEach(() => {
      installFakeTimeoutSignal();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('returns an AbortSignal', () => {
      const signal = createTimeoutSignal(1000);

      expect(signal).toBeInstanceOf(AbortSignal);
    });

    it('is not aborted immediately after creation', () => {
      const signal = createTimeoutSignal(1000);

      expect(signal.aborted).toBe(false);
    });

    it('aborts when the timeout elapses and not one millisecond earlier', async () => {
      const signal = createTimeoutSignal(20);

      await vi.advanceTimersByTimeAsync(19);
      expect(signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(1);
      expect(signal.aborted).toBe(true);
    });

    it('works with checkAborted after timeout', async () => {
      const signal = createTimeoutSignal(20);

      expect(() => checkAborted(signal, 'test')).not.toThrow();

      await vi.advanceTimersByTimeAsync(20);

      expect(() => checkAborted(signal, 'test')).toThrow(OperationAbortedError);
    });

    it('creates independent signals', async () => {
      const signal1 = createTimeoutSignal(20);
      const signal2 = createTimeoutSignal(60);

      await vi.advanceTimersByTimeAsync(20);

      expect(signal1.aborted).toBe(true);
      expect(signal2.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(40);

      expect(signal2.aborted).toBe(true);
    });
  });

  describe('Integration: iterateNodes with abort signal', () => {
    it('abort signal can be used to stop iteration', async () => {
      const controller = new AbortController();

      // Simulate an async generator that checks abort signal
      async function* mockIterateNodes(/** @type {any} */ options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
          { sha: 'sha3', parents: ['sha2'] },
        ];

        for (const node of nodes) {
          // Check for abort before yielding
          checkAborted(options.signal, 'iterateNodes');
          yield node;
        }
      }

      const collectedNodes: any[] = [];

      try {
        for await (const node of mockIterateNodes({ signal: controller.signal })) {
          collectedNodes.push(node);
          // Abort after first node
          if (collectedNodes.length === 1) {
            controller.abort();
          }
        }
        expect.fail('Should have thrown OperationAbortedError');
      } catch (err) {
        expect(err).toBeInstanceOf(OperationAbortedError);
        expect(collectedNodes).toHaveLength(1);
        const first = collectedNodes[0];
        expect(first).toBeDefined();
        expect(first?.sha).toBe('sha1');
      }
    });

    it('iteration completes normally when signal is not aborted', async () => {
      const controller = new AbortController();

      async function* mockIterateNodes(/** @type {any} */ options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
        ];

        for (const node of nodes) {
          checkAborted(options.signal, 'iterateNodes');
          yield node;
        }
      }

      const collectedNodes: any[] = [];
      for await (const node of mockIterateNodes({ signal: controller.signal })) {
        collectedNodes.push(node);
      }

      expect(collectedNodes).toHaveLength(2);
    });

    it('iteration works without signal', async () => {
      async function* mockIterateNodes(/** @type {any} */ options) {
        const nodes = [{ sha: 'sha1', parents: [] }];

        for (const node of nodes) {
          checkAborted(options.signal, 'iterateNodes');
          yield node;
        }
      }

      const collectedNodes: any[] = [];
      for await (const node of mockIterateNodes({})) {
        collectedNodes.push(node);
      }

      expect(collectedNodes).toHaveLength(1);
    });
  });

  describe('Integration: rebuild with abort signal', () => {
    beforeEach(() => {
      installFakeTimeoutSignal();
    });

    afterEach(() => {
      vi.restoreAllMocks();
      vi.useRealTimers();
    });

    it('abort signal can be used to cancel rebuild', async () => {
      const controller = new AbortController();
      let processedCount = 0;

      // Simulate a rebuild loop that checks the signal and spends 1 ms per node.
      async function mockRebuild(/** @type {any} */ options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
          { sha: 'sha3', parents: ['sha2'] },
          { sha: 'sha4', parents: ['sha3'] },
        ];

        for (const _node of nodes) {
          checkAborted(options.signal, 'rebuild');
          processedCount++;
          await fakeSleep(1);
        }

        return 'tree-oid';
      }

      // The abort timer is due at 1 ms, before the first node's work ends.
      fakeAbortAfter(controller, 1);
      const rebuild = mockRebuild({ signal: controller.signal });
      const outcome = expect(rebuild).rejects.toThrow(/Operation 'rebuild' aborted/);
      await vi.advanceTimersByTimeAsync(1);

      await outcome;
      await expect(rebuild).rejects.toBeInstanceOf(OperationAbortedError);
      expect(processedCount).toBe(1);
    });

    it('rebuild completes when signal is not aborted', async () => {
      const controller = new AbortController();

      async function mockRebuild(/** @type {any} */ options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
        ];

        for (const _node of nodes) {
          checkAborted(options.signal, 'rebuild');
        }

        return 'tree-oid';
      }

      const result = await mockRebuild({ signal: controller.signal });
      expect(result).toBe('tree-oid');
    });

    it('rebuild with timeout signal aborts after time limit', async () => {
      let processedCount = 0;

      async function mockLongRebuild(/** @type {any} */ options) {
        const manyNodes = Array.from({ length: 100 }, (_, i) => ({
          sha: `sha${i}`,
          parents: i > 0 ? [`sha${i - 1}`] : [],
        }));

        for (const _node of manyNodes) {
          checkAborted(options.signal, 'rebuild');
          processedCount++;
          await fakeSleep(5);
        }

        return 'tree-oid';
      }

      // Oracle: nodes start at 0, 5, 10, 15, 20, and 25 ms. The 30 ms timeout
      // fires before the sixth node's work ends, so exactly six nodes run.
      const signal = createTimeoutSignal(30);
      const rebuild = mockLongRebuild({ signal });
      const outcome = expect(rebuild).rejects.toBeInstanceOf(OperationAbortedError);
      await vi.advanceTimersByTimeAsync(30);

      await outcome;
      expect(processedCount).toBe(6);
    });
  });

  describe('Edge cases', () => {
    it('checkAborted handles objects without aborted property', () => {
      expect(() => checkAborted({}, 'test')).not.toThrow();
    });

    it('checkAborted handles aborted=undefined', () => {
      expect(() => checkAborted({ aborted: undefined }, 'test')).not.toThrow();
    });

    it('checkAborted handles aborted=false explicitly', () => {
      expect(() => checkAborted({ aborted: false }, 'test')).not.toThrow();
    });

    it('abort can happen multiple times without issue', () => {
      const controller = new AbortController();
      controller.abort();
      controller.abort(); // Second abort should be no-op

      expect(controller.signal.aborted).toBe(true);
      expect(() => checkAborted(controller.signal, 'test')).toThrow(OperationAbortedError);
    });

    it('OperationAbortedError with all options', () => {
      const error = new OperationAbortedError('fullTest', {
        reason: 'User cancelled',
        code: 'USER_CANCELLED',
        context: { userId: 123, timestamp: 1_767_225_600_000 },
      });

      expect(error.operation).toBe('fullTest');
      expect(error.reason).toBe('User cancelled');
      expect(error.code).toBe('USER_CANCELLED');
      expect(error.context['userId']).toBe(123);
    });
  });
});
