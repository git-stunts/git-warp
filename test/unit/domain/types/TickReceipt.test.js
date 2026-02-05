import { describe, it, expect } from 'vitest';
import {
  createTickReceipt,
  canonicalJson,
  OP_TYPES,
  RESULT_TYPES,
} from '../../../../src/domain/types/TickReceipt.js';

describe('TickReceipt', () => {
  // -----------------------------------------------------------------------
  // Valid construction
  // -----------------------------------------------------------------------
  describe('createTickReceipt', () => {
    it('creates a receipt with valid inputs', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc123',
        writer: 'alice',
        lamport: 5,
        ops: [
          { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
        ],
      });

      expect(receipt.patchSha).toBe('abc123');
      expect(receipt.writer).toBe('alice');
      expect(receipt.lamport).toBe(5);
      expect(receipt.ops).toHaveLength(1);
      expect(receipt.ops[0]).toEqual({
        op: 'NodeAdd',
        target: 'user:alice',
        result: 'applied',
      });
    });

    it('creates a receipt with all six op types', () => {
      const ops = [
        { op: 'NodeAdd', target: 'n1', result: 'applied' },
        { op: 'NodeTombstone', target: 'n2', result: 'superseded' },
        { op: 'EdgeAdd', target: 'n1\0n2\0follows', result: 'applied' },
        { op: 'EdgeTombstone', target: 'n1\0n2\0follows', result: 'redundant' },
        { op: 'PropSet', target: 'n1\0name', result: 'superseded', reason: 'LWW: writer bob at lamport 43 wins' },
        { op: 'BlobValue', target: 'n1\0avatar', result: 'applied' },
      ];

      const receipt = createTickReceipt({
        patchSha: 'deadbeef',
        writer: 'bob',
        lamport: 42,
        ops,
      });

      expect(receipt.ops).toHaveLength(6);
      expect(receipt.ops[4].reason).toBe('LWW: writer bob at lamport 43 wins');
    });

    it('creates a receipt with zero lamport', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha1',
        writer: 'w',
        lamport: 0,
        ops: [],
      });

      expect(receipt.lamport).toBe(0);
    });

    it('creates a receipt with empty ops array', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha1',
        writer: 'w',
        lamport: 1,
        ops: [],
      });

      expect(receipt.ops).toHaveLength(0);
    });

    it('omits reason property when undefined', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha1',
        writer: 'w',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect('reason' in receipt.ops[0]).toBe(false);
    });

    it('includes reason property when provided', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha1',
        writer: 'w',
        lamport: 1,
        ops: [{ op: 'PropSet', target: 'n1\0key', result: 'superseded', reason: 'lost LWW' }],
      });

      expect(receipt.ops[0].reason).toBe('lost LWW');
    });
  });

  // -----------------------------------------------------------------------
  // Immutability
  // -----------------------------------------------------------------------
  describe('immutability', () => {
    it('freezes the receipt object', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect(Object.isFrozen(receipt)).toBe(true);
    });

    it('freezes the ops array', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect(Object.isFrozen(receipt.ops)).toBe(true);
    });

    it('freezes each individual op', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [
          { op: 'NodeAdd', target: 'n1', result: 'applied' },
          { op: 'PropSet', target: 'n1\0key', result: 'superseded', reason: 'lost' },
        ],
      });

      for (const op of receipt.ops) {
        expect(Object.isFrozen(op)).toBe(true);
      }
    });

    it('throws when attempting to mutate receipt in strict mode', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect(() => { receipt.patchSha = 'new'; }).toThrow(TypeError);
      expect(() => { receipt.writer = 'new'; }).toThrow(TypeError);
      expect(() => { receipt.lamport = 99; }).toThrow(TypeError);
      expect(() => { receipt.ops = []; }).toThrow(TypeError);
    });

    it('throws when attempting to mutate ops array', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect(() => { receipt.ops.push({ op: 'NodeAdd', target: 'x', result: 'applied' }); }).toThrow(TypeError);
      expect(() => { receipt.ops[0] = { op: 'NodeAdd', target: 'x', result: 'applied' }; }).toThrow(TypeError);
    });

    it('throws when attempting to mutate an op entry', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      expect(() => { receipt.ops[0].result = 'superseded'; }).toThrow(TypeError);
    });

    it('does not alias caller ops objects', () => {
      const originalOp = { op: 'NodeAdd', target: 'n1', result: 'applied' };
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [originalOp],
      });

      // Mutating the original should not affect the receipt
      originalOp.result = 'superseded';
      expect(receipt.ops[0].result).toBe('applied');
    });
  });

  // -----------------------------------------------------------------------
  // Validation: patchSha
  // -----------------------------------------------------------------------
  describe('validation: patchSha', () => {
    it('rejects non-string patchSha', () => {
      expect(() => createTickReceipt({ patchSha: 123, writer: 'w', lamport: 0, ops: [] }))
        .toThrow('patchSha must be a non-empty string');
    });

    it('rejects empty patchSha', () => {
      expect(() => createTickReceipt({ patchSha: '', writer: 'w', lamport: 0, ops: [] }))
        .toThrow('patchSha must be a non-empty string');
    });

    it('rejects null patchSha', () => {
      expect(() => createTickReceipt({ patchSha: null, writer: 'w', lamport: 0, ops: [] }))
        .toThrow('patchSha must be a non-empty string');
    });

    it('rejects undefined patchSha', () => {
      expect(() => createTickReceipt({ patchSha: undefined, writer: 'w', lamport: 0, ops: [] }))
        .toThrow('patchSha must be a non-empty string');
    });
  });

  // -----------------------------------------------------------------------
  // Validation: writer
  // -----------------------------------------------------------------------
  describe('validation: writer', () => {
    it('rejects non-string writer', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 42, lamport: 0, ops: [] }))
        .toThrow('writer must be a non-empty string');
    });

    it('rejects empty writer', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: '', lamport: 0, ops: [] }))
        .toThrow('writer must be a non-empty string');
    });
  });

  // -----------------------------------------------------------------------
  // Validation: lamport
  // -----------------------------------------------------------------------
  describe('validation: lamport', () => {
    it('rejects negative lamport', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: -1, ops: [] }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects non-integer lamport', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: 1.5, ops: [] }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects NaN lamport', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: NaN, ops: [] }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects string lamport', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: '5', ops: [] }))
        .toThrow('lamport must be a non-negative integer');
    });

    it('rejects Infinity lamport', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: Infinity, ops: [] }))
        .toThrow('lamport must be a non-negative integer');
    });
  });

  // -----------------------------------------------------------------------
  // Validation: ops
  // -----------------------------------------------------------------------
  describe('validation: ops', () => {
    it('rejects non-array ops', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: 0, ops: 'not-array' }))
        .toThrow('ops must be an array');
    });

    it('rejects null ops', () => {
      expect(() => createTickReceipt({ patchSha: 'sha', writer: 'w', lamport: 0, ops: null }))
        .toThrow('ops must be an array');
    });

    it('rejects op with invalid op type', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 'InvalidOp', target: 'n1', result: 'applied' }],
      })).toThrow('ops[0].op must be one of');
    });

    it('rejects op with non-string op type', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 123, target: 'n1', result: 'applied' }],
      })).toThrow('ops[0].op must be one of');
    });

    it('rejects op with empty target', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 'NodeAdd', target: '', result: 'applied' }],
      })).toThrow('ops[0].target must be a non-empty string');
    });

    it('rejects op with non-string target', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 'NodeAdd', target: 42, result: 'applied' }],
      })).toThrow('ops[0].target must be a non-empty string');
    });

    it('rejects op with invalid result', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'invalid' }],
      })).toThrow('ops[0].result must be one of');
    });

    it('rejects op with non-string reason', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied', reason: 123 }],
      })).toThrow('ops[0].reason must be a string or undefined');
    });

    it('rejects non-object op entry', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: ['not-an-object'],
      })).toThrow('ops[0] must be an object');
    });

    it('rejects null op entry', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [null],
      })).toThrow('ops[0] must be an object');
    });

    it('reports correct index for second invalid op', () => {
      expect(() => createTickReceipt({
        patchSha: 'sha', writer: 'w', lamport: 0,
        ops: [
          { op: 'NodeAdd', target: 'n1', result: 'applied' },
          { op: 'BadOp', target: 'n2', result: 'applied' },
        ],
      })).toThrow('ops[1].op must be one of');
    });
  });

  // -----------------------------------------------------------------------
  // Canonical JSON
  // -----------------------------------------------------------------------
  describe('canonicalJson', () => {
    it('produces deterministic JSON', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'NodeAdd', target: 'n1', result: 'applied' }],
      });

      const json = canonicalJson(receipt);
      const parsed = JSON.parse(json);

      // Keys at top level are alphabetically sorted
      const topKeys = Object.keys(parsed);
      expect(topKeys).toEqual(['lamport', 'ops', 'patchSha', 'writer']);

      // Keys in each op are alphabetically sorted
      const opKeys = Object.keys(parsed.ops[0]);
      expect(opKeys).toEqual(['op', 'result', 'target']);
    });

    it('sorts reason key correctly when present', () => {
      const receipt = createTickReceipt({
        patchSha: 'abc',
        writer: 'alice',
        lamport: 1,
        ops: [{ op: 'PropSet', target: 'n1\0key', result: 'superseded', reason: 'LWW lost' }],
      });

      const json = canonicalJson(receipt);
      const parsed = JSON.parse(json);

      const opKeys = Object.keys(parsed.ops[0]);
      expect(opKeys).toEqual(['op', 'reason', 'result', 'target']);
    });

    it('produces identical JSON for identical receipts', () => {
      const args = {
        patchSha: 'deadbeef',
        writer: 'bob',
        lamport: 42,
        ops: [
          { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
          { op: 'PropSet', target: 'user:alice\0name', result: 'superseded', reason: 'LWW' },
        ],
      };

      const json1 = canonicalJson(createTickReceipt(args));
      const json2 = canonicalJson(createTickReceipt(args));

      expect(json1).toBe(json2);
    });

    it('produces valid JSON that round-trips', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha256',
        writer: 'writer-1',
        lamport: 100,
        ops: [
          { op: 'EdgeAdd', target: 'a\0b\0rel', result: 'applied' },
          { op: 'BlobValue', target: 'n1\0avatar', result: 'redundant' },
        ],
      });

      const json = canonicalJson(receipt);
      const parsed = JSON.parse(json);

      expect(parsed.patchSha).toBe('sha256');
      expect(parsed.writer).toBe('writer-1');
      expect(parsed.lamport).toBe(100);
      expect(parsed.ops).toHaveLength(2);
      expect(parsed.ops[0].op).toBe('EdgeAdd');
      expect(parsed.ops[1].result).toBe('redundant');
    });

    it('produces empty ops array in JSON for empty receipt', () => {
      const receipt = createTickReceipt({
        patchSha: 'sha',
        writer: 'w',
        lamport: 0,
        ops: [],
      });

      const json = canonicalJson(receipt);
      expect(json).toContain('"ops":[]');
    });
  });

  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  describe('constants', () => {
    it('exports the six valid op types', () => {
      expect(OP_TYPES).toEqual([
        'NodeAdd',
        'NodeTombstone',
        'EdgeAdd',
        'EdgeTombstone',
        'PropSet',
        'BlobValue',
      ]);
    });

    it('exports the three valid result types', () => {
      expect(RESULT_TYPES).toEqual([
        'applied',
        'superseded',
        'redundant',
      ]);
    });

    it('OP_TYPES is frozen', () => {
      expect(Object.isFrozen(OP_TYPES)).toBe(true);
    });

    it('RESULT_TYPES is frozen', () => {
      expect(Object.isFrozen(RESULT_TYPES)).toBe(true);
    });
  });
});
