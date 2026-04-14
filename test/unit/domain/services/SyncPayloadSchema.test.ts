/**
 * B64 — Sync payload validation tests.
 *
 * Tests Zod schema validation for sync request/response payloads:
 * - Shape validation
 * - Resource limit enforcement (DoS caps)
 * - Map vs object normalization (cbor-x compatibility)
 * - Invalid/malformed payloads rejected
 */

import { describe, it, expect } from 'vitest';
import {
  validateSyncRequest,
  validateSyncResponse,
  normalizeFrontier,
  DEFAULT_LIMITS,
  createSyncRequestSchema,
  createSyncResponseSchema,
} from '../../../../src/domain/services/sync/SyncPayloadSchema.ts';

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);

describe('SyncPayloadSchema', () => {
  describe('validateSyncRequest', () => {
    it('accepts valid sync request', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
        frontier: { w1: SHA_A, w2: SHA_B },
      });
      expect(result.ok).toBe(true);
    });

    it('accepts empty frontier', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
        frontier: {},
      });
      expect(result.ok).toBe(true);
    });

    it('rejects null', () => {
      const result = validateSyncRequest(null);
      expect(result.ok).toBe(false);
    });

    it('rejects wrong type', () => {
      const result = validateSyncRequest({
        type: 'sync-response',
        frontier: {},
      });
      expect(result.ok).toBe(false);
    });

    it('rejects missing frontier', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects array frontier', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
        frontier: [],
      });
      expect(result.ok).toBe(false);
    });

    it('accepts frontier with any string values (SHA validation is semantic, not schema)', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
        frontier: { w1: 'any-string-value' },
      });
      expect(result.ok).toBe(true);
    });

    it('rejects extra properties (strict mode)', () => {
      const result = validateSyncRequest({
        type: 'sync-request',
        frontier: {},
        malicious: 'data',
      });
      expect(result.ok).toBe(false);
    });

    it('rejects frontier exceeding writer limit', () => {
            const frontier = ({}) as Record<string, string>;
      for (let i = 0; i < 11; i++) {
        frontier[`w${i}`] = SHA_A;
      }
      const result = validateSyncRequest(
        { type: 'sync-request', frontier },
        { ...DEFAULT_LIMITS, maxWritersInFrontier: 10 },
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toContain('max writers');
      }
    });

    it('normalizes Map frontier from cbor-x', () => {
      const frontier = new Map([['w1', SHA_A]]);
      const payload = { type: 'sync-request', frontier };
      const result = validateSyncRequest(payload);
      expect(result.ok).toBe(true);
    });

    it('rejects Map frontier with non-string entries', () => {
      const frontier = new Map([[42, SHA_A]]);
      const payload = { type: 'sync-request', frontier };
      const result = validateSyncRequest(payload);
      expect(result.ok).toBe(false);
    });
  });

  describe('validateSyncResponse', () => {
    it('accepts valid sync response with patches', () => {
      const result = validateSyncResponse({
        type: 'sync-response',
        frontier: { w1: SHA_A },
        patches: [{
          writerId: 'w1',
          sha: SHA_A,
          patch: { ops: [{ type: 'NodeAdd', node: 'x', dot: ['w1', 1] }] },
        }],
      });
      expect(result.ok).toBe(true);
    });

    it('accepts empty patches array', () => {
      const result = validateSyncResponse({
        type: 'sync-response',
        frontier: { w1: SHA_A },
        patches: [],
      });
      expect(result.ok).toBe(true);
    });

    it('rejects wrong type', () => {
      const result = validateSyncResponse({
        type: 'sync-request',
        frontier: {},
        patches: [],
      });
      expect(result.ok).toBe(false);
    });

    it('rejects missing patches', () => {
      const result = validateSyncResponse({
        type: 'sync-response',
        frontier: {},
      });
      expect(result.ok).toBe(false);
    });

    it('rejects patches exceeding limit', () => {
      const patches: any[] = [];
      for (let i = 0; i < 6; i++) {
        patches.push({
          writerId: 'w1',
          sha: SHA_A,
          patch: { ops: [] },
        });
      }
      const result = validateSyncResponse(
        { type: 'sync-response', frontier: {}, patches },
        { ...DEFAULT_LIMITS, maxPatches: 5 },
      );
      expect(result.ok).toBe(false);
    });

    it('rejects patches with too many ops', () => {
      const ops: any[] = [];
      for (let i = 0; i < 6; i++) {
        ops.push({ type: 'NodeAdd', node: `n${i}`, dot: ['w1', i] });
      }
      const result = validateSyncResponse(
        {
          type: 'sync-response',
          frontier: {},
          patches: [{ writerId: 'w1', sha: SHA_A, patch: { ops } }],
        },
        { ...DEFAULT_LIMITS, maxOpsPerPatch: 5 },
      );
      expect(result.ok).toBe(false);
    });

    it('accepts patch entry with any string SHA (validation is semantic)', () => {
      const result = validateSyncResponse({
        type: 'sync-response',
        frontier: {},
        patches: [{
          writerId: 'w1',
          sha: 'any-sha-string',
          patch: { ops: [] },
        }],
      });
      expect(result.ok).toBe(true);
    });

    it('normalizes Map frontier from cbor-x', () => {
      const frontier = new Map([['w1', SHA_A]]);
      const result = validateSyncResponse({
        type: 'sync-response',
        frontier,
        patches: [],
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('normalizeFrontier', () => {
    it('converts Map to plain object', () => {
      const map = new Map([['w1', SHA_A], ['w2', SHA_B]]);
      const result = normalizeFrontier(map);
      expect(result).toEqual({ w1: SHA_A, w2: SHA_B });
    });

    it('passes through plain objects', () => {
      const obj = { w1: SHA_A };
      expect(normalizeFrontier(obj)).toBe(obj);
    });

    it('returns null for arrays', () => {
      expect(normalizeFrontier([])).toBeNull();
    });

    it('returns null for null', () => {
      expect(normalizeFrontier(null)).toBeNull();
    });

    it('returns null for Map with non-string keys', () => {
      const map = new Map([[42, SHA_A]]);
      expect(normalizeFrontier(map)).toBeNull();
    });

    it('returns null for Map with non-string values', () => {
      const map = new Map([['w1', 42]]);
      expect(normalizeFrontier(map)).toBeNull();
    });
  });

  describe('schema factory functions', () => {
    it('createSyncRequestSchema applies custom limits', () => {
      const schema = createSyncRequestSchema({ ...DEFAULT_LIMITS, maxWritersInFrontier: 2 });
      const result = schema.safeParse({
        type: 'sync-request',
        frontier: { w1: SHA_A, w2: SHA_B, w3: SHA_A },
      });
      expect(result.success).toBe(false);
    });

    it('createSyncResponseSchema applies custom limits', () => {
      const schema = createSyncResponseSchema({ ...DEFAULT_LIMITS, maxPatches: 1 });
      const result = schema.safeParse({
        type: 'sync-response',
        frontier: {},
        patches: [
          { writerId: 'w1', sha: SHA_A, patch: { ops: [] } },
          { writerId: 'w2', sha: SHA_B, patch: { ops: [] } },
        ],
      });
      expect(result.success).toBe(false);
    });
  });
});
