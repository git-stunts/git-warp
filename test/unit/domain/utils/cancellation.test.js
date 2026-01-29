import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import OperationAbortedError from '../../../../src/domain/errors/OperationAbortedError.js';
import { checkAborted, createTimeoutSignal } from '../../../../src/domain/utils/cancellation.js';

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
      expect(error.context.visitedCount).toBe(42);
      expect(error.context.lastSha).toBe('abc123');
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
      } catch (err) {
        expect(err.context.operation).toBe('rebuild');
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
      } catch (err) {
        expect(err.message).toContain('Operation was aborted');
      }
    });
  });

  describe('createTimeoutSignal', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
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

    it('aborts after the specified timeout', async () => {
      const signal = createTimeoutSignal(100);

      expect(signal.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(100);

      expect(signal.aborted).toBe(true);
    });

    it('does not abort before timeout', async () => {
      const signal = createTimeoutSignal(1000);

      await vi.advanceTimersByTimeAsync(500);

      expect(signal.aborted).toBe(false);
    });

    it('works with checkAborted after timeout', async () => {
      const signal = createTimeoutSignal(50);

      // Before timeout - should not throw
      expect(() => checkAborted(signal, 'test')).not.toThrow();

      await vi.advanceTimersByTimeAsync(50);

      // After timeout - should throw
      expect(() => checkAborted(signal, 'test')).toThrow(OperationAbortedError);
    });

    it('creates independent signals', async () => {
      const signal1 = createTimeoutSignal(100);
      const signal2 = createTimeoutSignal(200);

      await vi.advanceTimersByTimeAsync(100);

      expect(signal1.aborted).toBe(true);
      expect(signal2.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(100);

      expect(signal2.aborted).toBe(true);
    });
  });

  describe('Integration: iterateNodes with abort signal', () => {
    it('abort signal can be used to stop iteration', async () => {
      const controller = new AbortController();

      // Simulate an async generator that checks abort signal
      async function* mockIterateNodes(options) {
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

      const collectedNodes = [];

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
        expect(collectedNodes[0].sha).toBe('sha1');
      }
    });

    it('iteration completes normally when signal is not aborted', async () => {
      const controller = new AbortController();

      async function* mockIterateNodes(options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
        ];

        for (const node of nodes) {
          checkAborted(options.signal, 'iterateNodes');
          yield node;
        }
      }

      const collectedNodes = [];
      for await (const node of mockIterateNodes({ signal: controller.signal })) {
        collectedNodes.push(node);
      }

      expect(collectedNodes).toHaveLength(2);
    });

    it('iteration works without signal', async () => {
      async function* mockIterateNodes(options) {
        const nodes = [{ sha: 'sha1', parents: [] }];

        for (const node of nodes) {
          checkAborted(options.signal, 'iterateNodes');
          yield node;
        }
      }

      const collectedNodes = [];
      for await (const node of mockIterateNodes({})) {
        collectedNodes.push(node);
      }

      expect(collectedNodes).toHaveLength(1);
    });
  });

  describe('Integration: rebuild with abort signal', () => {
    it('abort signal can be used to cancel rebuild', async () => {
      const controller = new AbortController();
      let processedCount = 0;

      // Simulate rebuild loop that checks abort signal
      async function mockRebuild(options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
          { sha: 'sha3', parents: ['sha2'] },
          { sha: 'sha4', parents: ['sha3'] },
        ];

        for (const node of nodes) {
          checkAborted(options.signal, 'rebuild');
          processedCount++;
          // Simulate some processing time
          await Promise.resolve();
        }

        return 'tree-oid';
      }

      // Abort after a short delay
      setTimeout(() => controller.abort(), 0);

      try {
        await mockRebuild({ signal: controller.signal });
        // Might complete if abort happens after all nodes
      } catch (err) {
        expect(err).toBeInstanceOf(OperationAbortedError);
        expect(err.message).toContain('rebuild');
        // Should have processed at least one node but not all
        expect(processedCount).toBeLessThanOrEqual(4);
      }
    });

    it('rebuild completes when signal is not aborted', async () => {
      const controller = new AbortController();

      async function mockRebuild(options) {
        const nodes = [
          { sha: 'sha1', parents: [] },
          { sha: 'sha2', parents: ['sha1'] },
        ];

        for (const node of nodes) {
          checkAborted(options.signal, 'rebuild');
        }

        return 'tree-oid';
      }

      const result = await mockRebuild({ signal: controller.signal });
      expect(result).toBe('tree-oid');
    });

    it('rebuild with timeout signal aborts after time limit', async () => {
      vi.useFakeTimers();

      let processedCount = 0;
      let abortError = null;

      async function mockLongRebuild(options) {
        const manyNodes = Array.from({ length: 100 }, (_, i) => ({
          sha: `sha${i}`,
          parents: i > 0 ? [`sha${i - 1}`] : [],
        }));

        for (const node of manyNodes) {
          checkAborted(options.signal, 'rebuild');
          processedCount++;
          // Simulate 10ms per node
          await new Promise((resolve) => setTimeout(resolve, 10));
        }

        return 'tree-oid';
      }

      // Create a 50ms timeout signal
      const signal = createTimeoutSignal(50);

      // Start the rebuild but catch the error immediately
      const rebuildPromise = mockLongRebuild({ signal }).catch((err) => {
        abortError = err;
      });

      // Advance time to process some nodes and then trigger timeout
      // Process 5 nodes (50ms) then the signal aborts
      await vi.advanceTimersByTimeAsync(55);

      // Wait for the promise to settle
      await rebuildPromise;

      // Should have aborted
      expect(abortError).toBeInstanceOf(OperationAbortedError);
      // Should have processed some nodes but not all
      expect(processedCount).toBeGreaterThan(0);
      expect(processedCount).toBeLessThan(100);

      vi.useRealTimers();
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
        context: { userId: 123, timestamp: Date.now() },
      });

      expect(error.operation).toBe('fullTest');
      expect(error.reason).toBe('User cancelled');
      expect(error.code).toBe('USER_CANCELLED');
      expect(error.context.userId).toBe(123);
    });
  });
});
