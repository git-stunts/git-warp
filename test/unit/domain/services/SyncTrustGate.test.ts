/**
 * B1 — SyncTrustGate unit tests.
 *
 * Tests trust evaluation for sync operations:
 * - Trust disabled: always allows
 * - Enforce mode: rejects untrusted writers
 * - Log-only mode: warns but allows untrusted writers
 * - Writer extraction from patches
 * - Error handling in trust evaluation
 */

import { describe, it, expect, vi } from 'vitest';
import SyncTrustGate from '../../../../src/domain/services/sync/SyncTrustGate.js';

function createMockLogger() {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: vi.fn(),
  };
}

function createMockEvaluator(trustedWriters: string[] = []) {
  return {
    evaluateWriters: vi.fn(async () => ({
      trusted: new Set(trustedWriters),
    })),
  };
}

describe('SyncTrustGate', () => {
  describe('evaluate', () => {
    it('allows all writers when trust is off', async () => {
      const gate = new SyncTrustGate({ trustMode: 'off' });
      const result = await gate.evaluate(['w1', 'w2']);
      expect(result.allowed).toBe(true);
      expect(result.verdict).toBe('trust_disabled');
    });

    it('allows all writers when no evaluator is provided', async () => {
      const gate = new SyncTrustGate({ trustMode: 'enforce' });
      const result = await gate.evaluate(['w1']);
      expect(result.allowed).toBe(true);
      expect(result.verdict).toBe('trust_disabled');
    });

    it('allows empty writer list', async () => {
      const evaluator = createMockEvaluator(['w1']);
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'enforce',
      });
      const result = await gate.evaluate([]);
      expect(result.allowed).toBe(true);
      expect(result.verdict).toBe('no_writers');
    });

    it('allows trusted writers in enforce mode', async () => {
      const evaluator = createMockEvaluator(['w1', 'w2']);
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'enforce',
        logger,
      });

      const result = await gate.evaluate(['w1', 'w2']);
      expect(result.allowed).toBe(true);
      expect(result.verdict).toBe('pass');
      expect(result.untrustedWriters).toEqual([]);
    });

    it('rejects untrusted writers in enforce mode', async () => {
      const evaluator = createMockEvaluator(['w1']);
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'enforce',
        logger,
      });

      const result = await gate.evaluate(['w1', 'w2']);
      expect(result.allowed).toBe(false);
      expect(result.untrustedWriters).toEqual(['w2']);
      expect(result.verdict).toBe('rejected');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('rejected'),
        expect.objectContaining({
          code: 'SYNC_TRUST_REJECTED',
          untrustedWriters: ['w2'],
        }),
      );
    });

    it('warns but allows untrusted writers in log-only mode', async () => {
      const evaluator = createMockEvaluator(['w1']);
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'log-only',
        logger,
      });

      const result = await gate.evaluate(['w1', 'w2']);
      expect(result.allowed).toBe(true);
      expect(result.untrustedWriters).toEqual(['w2']);
      expect(result.verdict).toBe('warn_allowed');
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('log-only'),
        expect.objectContaining({
          code: 'SYNC_TRUST_WARN',
        }),
      );
    });

    it('includes context in log messages', async () => {
      const evaluator = createMockEvaluator(['w1']);
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'enforce',
        logger,
      });

      await gate.evaluate(['w1'], { graphName: 'events', peerId: 'peer-1' });
      expect(logger.info).toHaveBeenCalledWith(
        'Trust gate decision',
        expect.objectContaining({
          graphName: 'events',
          peerId: 'peer-1',
        }),
      );
    });

    it('fails closed on evaluator error in enforce mode', async () => {
      const evaluator = {
        evaluateWriters: vi.fn(async () => { throw new Error('DB down'); }),
      };
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'enforce',
        logger,
      });

      const result = await gate.evaluate(['w1']);
      expect(result.allowed).toBe(false);
      expect(result.verdict).toBe('error_rejected');
      expect(logger.error).toHaveBeenCalled();
    });

    it('fails open on evaluator error in log-only mode', async () => {
      const evaluator = {
        evaluateWriters: vi.fn(async () => { throw new Error('DB down'); }),
      };
      const logger = createMockLogger();
      const gate = new SyncTrustGate({
        trustEvaluator: (evaluator),
        trustMode: 'log-only',
        logger,
      });

      const result = await gate.evaluate(['w1']);
      expect(result.allowed).toBe(true);
      expect(result.verdict).toBe('error_allowed');
    });
  });

  describe('extractWritersFromPatches', () => {
    it('extracts unique writer IDs', () => {
      const patches = [
        { writerId: 'w1', sha: 'a'.repeat(40), patch: {} },
        { writerId: 'w2', sha: 'b'.repeat(40), patch: {} },
        { writerId: 'w1', sha: 'c'.repeat(40), patch: {} },
      ];
      const writers = SyncTrustGate.extractWritersFromPatches(patches);
      expect(writers.sort()).toEqual(['w1', 'w2']);
    });

    it('returns empty array for empty patches', () => {
      expect(SyncTrustGate.extractWritersFromPatches([])).toEqual([]);
    });

    it('skips entries without writerId', () => {
      const patches = [
        { writerId: 'w1', sha: 'a'.repeat(40), patch: {} },
        { writerId: '', sha: 'b'.repeat(40), patch: {} },
      ];
      const writers = SyncTrustGate.extractWritersFromPatches(patches);
      expect(writers).toEqual(['w1']);
    });
  });
});
