/**
 * @fileoverview Audit Receipt Specification — Golden Vector Tests
 *
 * Validates canonical serialization and digest computation against the
 * normative test vectors in docs/specs/AUDIT_RECEIPT.md (Section 10).
 *
 * All assertions are byte-level: exact hex comparisons, not just semantic
 * equality. This ensures any conforming implementation produces identical
 * output for the same inputs.
 *
 * @see docs/specs/AUDIT_RECEIPT.md
 */

import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
  encode as cborEncode,
  decode as cborDecode,
} from '../../../src/infrastructure/codecs/CborCodec.js';

// ============================================================================
// Helpers — mirrors the canonical algorithms from the spec
// ============================================================================

/**
 * Sorted-key replacer for JSON.stringify (spec Section 5.2).
 * @param {string} _key
 * @param {unknown} value
 * @returns {unknown}
 */
function sortedReplacer(_key, value) {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    /** @type {Record<string, unknown>} */
    const sorted = {};
    const obj = /** @type {Record<string, unknown>} */ (value);
    for (const k of Object.keys(obj).sort()) {
      sorted[k] = obj[k];
    }
    return sorted;
  }
  return value;
}

/**
 * Canonical JSON of an ops array (spec Section 5.2).
 * @param {ReadonlyArray<Record<string, unknown>>} ops
 * @returns {string}
 */
function canonicalOpsJson(ops) {
  return JSON.stringify(ops, sortedReplacer);
}

/**
 * Domain-separated opsDigest (spec Section 5.3).
 * @param {ReadonlyArray<Record<string, unknown>>} ops
 * @returns {string}
 */
function computeOpsDigest(ops) {
  const json = canonicalOpsJson(ops);
  const prefix = 'git-warp:opsDigest:v1\0';
  const buf = Buffer.concat([
    Buffer.from(prefix, 'utf8'),
    Buffer.from(json, 'utf8'),
  ]);
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Canonical CBOR of a receipt (spec Section 5.4).
 * Returns hex string.
 * @param {Record<string, unknown>} receipt
 * @returns {string}
 */
function receiptCborHex(receipt) {
  return Buffer.from(cborEncode(receipt)).toString('hex');
}

/**
 * Build the canonical trailer block (spec Section 5.6).
 * @param {Record<string, unknown>} receipt
 * @returns {string}
 */
function buildTrailerBlock(receipt) {
  return [
    `eg-data-commit: ${receipt.dataCommit}`,
    `eg-graph: ${receipt.graphName}`,
    `eg-kind: audit`,
    `eg-ops-digest: ${receipt.opsDigest}`,
    `eg-schema: 1`,
    `eg-writer: ${receipt.writerId}`,
  ].join('\n');
}

/**
 * Validate a receipt against v1 schema rules.
 * Returns an error message string, or null if valid.
 * @param {Record<string, *>} receipt
 * @returns {string|null}
 */
function validateReceipt(receipt) {
  // version
  if (receipt.version === undefined) {
    return 'missing required field: version';
  }
  if (receipt.version === 0) {
    return 'invalid version: must be >= 1';
  }
  if (receipt.version > 1) {
    return 'unsupported version';
  }

  // graphName
  if (receipt.graphName === undefined) {
    return 'missing required field: graphName';
  }

  // writerId
  if (receipt.writerId === undefined) {
    return 'missing required field: writerId';
  }

  // dataCommit
  if (receipt.dataCommit === undefined) {
    return 'missing required field: dataCommit';
  }
  if (!/^[0-9a-f]{40}([0-9a-f]{24})?$/.test(receipt.dataCommit)) {
    return 'invalid OID format: dataCommit';
  }

  // tickStart, tickEnd
  if (receipt.tickStart === undefined) {
    return 'missing required field: tickStart';
  }
  if (receipt.tickEnd === undefined) {
    return 'missing required field: tickEnd';
  }
  if (receipt.tickStart > receipt.tickEnd) {
    return 'tickStart must be <= tickEnd';
  }
  if (receipt.version === 1 && receipt.tickStart !== receipt.tickEnd) {
    return 'v1 requires tickStart == tickEnd';
  }

  // opsDigest
  if (receipt.opsDigest === undefined) {
    return 'missing required field: opsDigest';
  }

  // prevAuditCommit
  if (receipt.prevAuditCommit === undefined) {
    return 'missing required field: prevAuditCommit';
  }

  // OID length consistency
  const oidLen = receipt.dataCommit.length;
  if (oidLen !== 40 && oidLen !== 64) {
    return 'invalid OID length';
  }
  if (receipt.prevAuditCommit.length !== oidLen) {
    return 'OID length mismatch';
  }

  // Non-genesis with zero-hash sentinel
  const zeroHash = '0'.repeat(oidLen);
  if (receipt.prevAuditCommit === zeroHash && receipt.tickStart > 1) {
    return 'non-genesis receipt cannot use zero-hash sentinel';
  }

  // timestamp
  if (receipt.timestamp === undefined) {
    return 'missing required field: timestamp';
  }
  if (!Number.isInteger(receipt.timestamp) || receipt.timestamp < 0) {
    return 'invalid timestamp: must be a non-negative integer';
  }

  return null;
}

/**
 * Check for duplicate trailer keys.
 * Returns an error message string, or null if no duplicates.
 * @param {string} trailerText
 * @returns {string|null}
 */
function checkDuplicateTrailers(trailerText) {
  const lines = trailerText.split('\n').filter((l) => l.includes(': '));
  const keys = lines.map((l) => l.split(': ')[0]);
  const seen = new Set();
  for (const key of keys) {
    if (seen.has(key)) {
      return `duplicate trailer: ${key}`;
    }
    seen.add(key);
  }
  return null;
}

// ============================================================================
// Positive Vectors
// ============================================================================

describe('Audit Receipt Spec — Positive Vectors', () => {
  describe('Vector 1: Genesis receipt (SHA-1 OIDs)', () => {
    const ops = [
      { op: 'NodeAdd', target: 'user:alice', result: 'applied' },
      { op: 'PropSet', target: 'user:alice\0name', result: 'applied' },
    ];

    const expectedOpsJsonHex =
      '5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c696365227d2c7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c6963655c75303030306e616d65227d5d';

    const expectedOpsDigest =
      '63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe';

    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: expectedOpsDigest,
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };

    const expectedCborHex =
      'b900096a64617461436f6d6d69747828616161616161616161616161616161616161616161616161616161616161616161616161616161616967726170684e616d65666576656e7473696f70734469676573747840363364663765616130356535646333386234333666666435363264616439366432313735633766613038396665633664663862623738626463333839623866656f707265764175646974436f6d6d6974782830303030303030303030303030303030303030303030303030303030303030303030303030303030677469636b456e6401697469636b5374617274016974696d657374616d70fb4279bbef3b0000006776657273696f6e0168777269746572496465616c696365';

    it('canonical JSON matches expected hex bytes', () => {
      const json = canonicalOpsJson(ops);
      const hex = Buffer.from(json, 'utf8').toString('hex');
      expect(hex).toBe(expectedOpsJsonHex);
    });

    it('opsDigest matches expected value', () => {
      expect(computeOpsDigest(ops)).toBe(expectedOpsDigest);
    });

    it('receipt CBOR matches expected hex bytes', () => {
      expect(receiptCborHex(receipt)).toBe(expectedCborHex);
    });

    it('trailer block matches expected text', () => {
      const expected = [
        `eg-data-commit: ${'a'.repeat(40)}`,
        'eg-graph: events',
        'eg-kind: audit',
        `eg-ops-digest: ${expectedOpsDigest}`,
        'eg-schema: 1',
        'eg-writer: alice',
      ].join('\n');
      expect(buildTrailerBlock(receipt)).toBe(expected);
    });

    it('uses 40-char OIDs throughout', () => {
      expect(receipt.dataCommit).toHaveLength(40);
      expect(receipt.prevAuditCommit).toHaveLength(40);
    });

    it('passes schema validation', () => {
      expect(validateReceipt(receipt)).toBeNull();
    });
  });

  describe('Vector 2: Continuation receipt (SHA-1 OIDs)', () => {
    const ops = [
      {
        op: 'EdgeAdd',
        target: 'user:alice\0user:bob\0follows',
        result: 'applied',
      },
    ];

    const expectedOpsJsonHex =
      '5b7b226f70223a2245646765416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a616c6963655c7530303030757365723a626f625c7530303030666f6c6c6f7773227d5d';

    const expectedOpsDigest =
      '2d060db4f93b99b55c5effdf7f28042e09c1e93f1e0369a7e561bfc639f4e3d3';

    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'b'.repeat(40),
      tickStart: 2,
      tickEnd: 2,
      opsDigest: expectedOpsDigest,
      prevAuditCommit: 'c'.repeat(40),
      timestamp: 1768435260000,
    };

    const expectedCborHex =
      'b900096a64617461436f6d6d69747828626262626262626262626262626262626262626262626262626262626262626262626262626262626967726170684e616d65666576656e7473696f70734469676573747840326430363064623466393362393962353563356566666466376632383034326530396331653933663165303336396137653536316266633633396634653364336f707265764175646974436f6d6d6974782863636363636363636363636363636363636363636363636363636363636363636363636363636363677469636b456e6402697469636b5374617274026974696d657374616d70fb4279bbef49a600006776657273696f6e0168777269746572496465616c696365';

    it('canonical JSON matches expected hex bytes', () => {
      const json = canonicalOpsJson(ops);
      const hex = Buffer.from(json, 'utf8').toString('hex');
      expect(hex).toBe(expectedOpsJsonHex);
    });

    it('opsDigest matches expected value', () => {
      expect(computeOpsDigest(ops)).toBe(expectedOpsDigest);
    });

    it('receipt CBOR matches expected hex bytes', () => {
      expect(receiptCborHex(receipt)).toBe(expectedCborHex);
    });

    it('trailer block matches expected text', () => {
      const expected = [
        `eg-data-commit: ${'b'.repeat(40)}`,
        'eg-graph: events',
        'eg-kind: audit',
        `eg-ops-digest: ${expectedOpsDigest}`,
        'eg-schema: 1',
        'eg-writer: alice',
      ].join('\n');
      expect(buildTrailerBlock(receipt)).toBe(expected);
    });

    it('uses 40-char OIDs throughout', () => {
      expect(receipt.dataCommit).toHaveLength(40);
      expect(receipt.prevAuditCommit).toHaveLength(40);
    });

    it('passes schema validation', () => {
      expect(validateReceipt(receipt)).toBeNull();
    });
  });

  describe('Vector 3: Mixed outcomes', () => {
    const ops = [
      { op: 'NodeAdd', target: 'user:charlie', result: 'applied' },
      {
        op: 'PropSet',
        target: 'user:alice\0name',
        result: 'superseded',
        reason: 'LWW: writer bob at lamport 5 wins',
      },
      { op: 'NodeAdd', target: 'user:alice', result: 'redundant' },
    ];

    const expectedOpsJsonHex =
      '5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22757365723a636861726c6965227d2c7b226f70223a2250726f70536574222c22726561736f6e223a224c57573a2077726974657220626f62206174206c616d706f727420352077696e73222c22726573756c74223a2273757065727365646564222c22746172676574223a22757365723a616c6963655c75303030306e616d65227d2c7b226f70223a224e6f6465416464222c22726573756c74223a22726564756e64616e74222c22746172676574223a22757365723a616c696365227d5d';

    const expectedOpsDigest =
      'c8e06e3a8b8d920dd9b27ebb4d5944e91053314150cd3671d0557d3cff58d057';

    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'd'.repeat(40),
      tickStart: 3,
      tickEnd: 3,
      opsDigest: expectedOpsDigest,
      prevAuditCommit: 'e'.repeat(40),
      timestamp: 1768435320000,
    };

    const expectedCborHex =
      'b900096a64617461436f6d6d69747828646464646464646464646464646464646464646464646464646464646464646464646464646464646967726170684e616d65666576656e7473696f70734469676573747840633865303665336138623864393230646439623237656262346435393434653931303533333134313530636433363731643035353764336366663538643035376f707265764175646974436f6d6d6974782865656565656565656565656565656565656565656565656565656565656565656565656565656565677469636b456e6403697469636b5374617274036974696d657374616d70fb4279bbef584c00006776657273696f6e0168777269746572496465616c696365';

    it('canonical JSON matches expected hex bytes', () => {
      const json = canonicalOpsJson(ops);
      const hex = Buffer.from(json, 'utf8').toString('hex');
      expect(hex).toBe(expectedOpsJsonHex);
    });

    it('opsDigest matches expected value', () => {
      expect(computeOpsDigest(ops)).toBe(expectedOpsDigest);
    });

    it('receipt CBOR matches expected hex bytes', () => {
      expect(receiptCborHex(receipt)).toBe(expectedCborHex);
    });

    it('reason field is present in canonical JSON with sorted keys', () => {
      const json = canonicalOpsJson(ops);
      // "reason" comes before "result" in sorted order
      expect(json).toContain('"reason":"LWW: writer bob at lamport 5 wins","result":"superseded"');
    });

    it('reason field is absent for ops without reason', () => {
      const json = canonicalOpsJson(ops);
      // First op (NodeAdd applied) should NOT have reason key
      const firstOp = JSON.parse(json)[0];
      expect(firstOp).not.toHaveProperty('reason');
    });

    it('passes schema validation', () => {
      expect(validateReceipt(receipt)).toBeNull();
    });
  });

  describe('Vector 4: SHA-256 OIDs', () => {
    const ops = [
      { op: 'NodeAdd', target: 'server:prod-1', result: 'applied' },
    ];

    const expectedOpsJsonHex =
      '5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a227365727665723a70726f642d31227d5d';

    const expectedOpsDigest =
      '03a8cb1f891ac5b92277271559bf4e2f235a4313a04ab947c1ec5a4f78185cb8';

    const receipt = {
      version: 1,
      graphName: 'infra',
      writerId: 'deployer',
      dataCommit: 'f'.repeat(64),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: expectedOpsDigest,
      prevAuditCommit: '0'.repeat(64),
      timestamp: 1768435200000,
    };

    const expectedCborHex =
      'b900096a64617461436f6d6d69747840666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666666967726170684e616d6565696e667261696f70734469676573747840303361386362316638393161633562393232373732373135353962663465326632333561343331336130346162393437633165633561346637383138356362386f707265764175646974436f6d6d6974784030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030303030677469636b456e6401697469636b5374617274016974696d657374616d70fb4279bbef3b0000006776657273696f6e01687772697465724964686465706c6f796572';

    it('canonical JSON matches expected hex bytes', () => {
      const json = canonicalOpsJson(ops);
      const hex = Buffer.from(json, 'utf8').toString('hex');
      expect(hex).toBe(expectedOpsJsonHex);
    });

    it('opsDigest matches expected value', () => {
      expect(computeOpsDigest(ops)).toBe(expectedOpsDigest);
    });

    it('receipt CBOR matches expected hex bytes', () => {
      expect(receiptCborHex(receipt)).toBe(expectedCborHex);
    });

    it('trailer block matches expected text', () => {
      const expected = [
        `eg-data-commit: ${'f'.repeat(64)}`,
        'eg-graph: infra',
        'eg-kind: audit',
        `eg-ops-digest: ${expectedOpsDigest}`,
        'eg-schema: 1',
        'eg-writer: deployer',
      ].join('\n');
      expect(buildTrailerBlock(receipt)).toBe(expected);
    });

    it('uses 64-char OIDs throughout', () => {
      expect(receipt.dataCommit).toHaveLength(64);
      expect(receipt.prevAuditCommit).toHaveLength(64);
    });

    it('passes schema validation', () => {
      expect(validateReceipt(receipt)).toBeNull();
    });
  });
});

// ============================================================================
// String Escaping Edge Cases
// ============================================================================

describe('Audit Receipt Spec — String Escaping', () => {
  it('null byte (U+0000) encodes as \\u0000 in canonical JSON', () => {
    const ops = [
      { op: 'PropSet', target: 'node:a\0key', result: 'applied' },
    ];
    const json = canonicalOpsJson(ops);
    const hex = Buffer.from(json, 'utf8').toString('hex');

    const expectedHex =
      '5b7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a226e6f64653a615c75303030306b6579227d5d';
    expect(hex).toBe(expectedHex);

    // Verify the \u0000 escape is present in the JSON string
    expect(json).toContain('\\u0000');
  });

  it('unicode characters (CJK, Greek) are raw UTF-8, not escaped', () => {
    const ops = [
      { op: 'NodeAdd', target: '节点:α', result: 'applied' },
    ];
    const json = canonicalOpsJson(ops);
    const hex = Buffer.from(json, 'utf8').toString('hex');

    const expectedHex =
      '5b7b226f70223a224e6f6465416464222c22726573756c74223a226170706c696564222c22746172676574223a22e88a82e782b93aceb1227d5d';
    expect(hex).toBe(expectedHex);

    // Verify raw characters present (not escaped)
    expect(json).toContain('节点:α');
  });

  it('quotes and backslashes are properly escaped', () => {
    const ops = [
      { op: 'PropSet', target: 'say "hello\\world"', result: 'applied' },
    ];
    const json = canonicalOpsJson(ops);
    const hex = Buffer.from(json, 'utf8').toString('hex');

    const expectedHex =
      '5b7b226f70223a2250726f70536574222c22726573756c74223a226170706c696564222c22746172676574223a22736179205c2268656c6c6f5c5c776f726c645c22227d5d';
    expect(hex).toBe(expectedHex);

    // Verify escaped forms
    expect(json).toContain('\\"');
    expect(json).toContain('\\\\');
  });
});

// ============================================================================
// OID Consistency
// ============================================================================

describe('Audit Receipt Spec — OID Consistency', () => {
  it('SHA-1 vectors use 40-char OIDs throughout', () => {
    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
    expect(receipt.dataCommit).toHaveLength(40);
    expect(receipt.prevAuditCommit).toHaveLength(40);
    expect(validateReceipt(receipt)).toBeNull();
  });

  it('SHA-256 vectors use 64-char OIDs throughout', () => {
    const receipt = {
      version: 1,
      graphName: 'infra',
      writerId: 'deployer',
      dataCommit: 'f'.repeat(64),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(64),
      timestamp: 1768435200000,
    };
    expect(receipt.dataCommit).toHaveLength(64);
    expect(receipt.prevAuditCommit).toHaveLength(64);
    expect(validateReceipt(receipt)).toBeNull();
  });

  it('mixed-length OIDs are rejected (40-char sentinel with 64-char dataCommit)', () => {
    const receipt = {
      version: 1,
      graphName: 'infra',
      writerId: 'deployer',
      dataCommit: 'f'.repeat(64),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
    expect(validateReceipt(receipt)).toBe('OID length mismatch');
  });
});

// ============================================================================
// Negative Fixtures
// ============================================================================

describe('Audit Receipt Spec — Negative Fixtures', () => {
  /** Base valid receipt for mutation testing. */
  function baseReceipt() {
    return {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
  }

  it('N1: rejects version 2 (unsupported)', () => {
    const r = baseReceipt();
    r.version = 2;
    expect(validateReceipt(r)).toBe('unsupported version');
  });

  it('N2: rejects version 0 (invalid)', () => {
    const r = baseReceipt();
    r.version = 0;
    expect(validateReceipt(r)).toBe('invalid version: must be >= 1');
  });

  it('N3: rejects missing required field (graphName)', () => {
    const r = baseReceipt();
    delete (/** @type {any} */ (r)).graphName;
    expect(validateReceipt(r)).toBe('missing required field: graphName');
  });

  it('N3b: rejects missing required field (writerId)', () => {
    const r = baseReceipt();
    delete (/** @type {any} */ (r)).writerId;
    expect(validateReceipt(r)).toBe('missing required field: writerId');
  });

  it('N3c: rejects missing required field (timestamp)', () => {
    const r = baseReceipt();
    delete (/** @type {any} */ (r)).timestamp;
    expect(validateReceipt(r)).toBe('missing required field: timestamp');
  });

  it('N4: rejects tickStart > tickEnd', () => {
    const r = baseReceipt();
    r.tickStart = 3;
    r.tickEnd = 1;
    expect(validateReceipt(r)).toBe('tickStart must be <= tickEnd');
  });

  it('N5: rejects tickStart != tickEnd in v1', () => {
    const r = baseReceipt();
    r.tickStart = 1;
    r.tickEnd = 3;
    expect(validateReceipt(r)).toBe('v1 requires tickStart == tickEnd');
  });

  it('N6: rejects invalid dataCommit (not hex)', () => {
    const r = baseReceipt();
    r.dataCommit = 'z'.repeat(40);
    expect(validateReceipt(r)).toBe('invalid OID format: dataCommit');
  });

  it('N7: rejects genesis sentinel length mismatch', () => {
    const r = baseReceipt();
    r.dataCommit = 'f'.repeat(64);
    r.prevAuditCommit = '0'.repeat(40);
    expect(validateReceipt(r)).toBe('OID length mismatch');
  });

  it('N8: rejects non-genesis receipt with zero-hash prevAuditCommit', () => {
    const r = baseReceipt();
    r.tickStart = 5;
    r.tickEnd = 5;
    r.prevAuditCommit = '0'.repeat(40);
    expect(validateReceipt(r)).toBe(
      'non-genesis receipt cannot use zero-hash sentinel',
    );
  });

  it('N9: rejects duplicate trailer key', () => {
    const trailerText = [
      'eg-data-commit: ' + 'a'.repeat(40),
      'eg-graph: events',
      'eg-kind: audit',
      'eg-kind: patch',
      'eg-ops-digest: ' + '0'.repeat(64),
      'eg-schema: 1',
      'eg-writer: alice',
    ].join('\n');
    expect(checkDuplicateTrailers(trailerText)).toBe('duplicate trailer: eg-kind');
  });
});

// ============================================================================
// Chain Break Dramatization
// ============================================================================

describe('Audit Receipt Spec — Chain Break Dramatization', () => {
  it('single byte flip in receipt CBOR is detectable', () => {
    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest:
        '63df7eaa05e5dc38b436ffd562dad96d2175c7fa089fec6df8bb78bdc389b8fe',
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };

    // Encode the receipt
    const originalCbor = Buffer.from(cborEncode(receipt));

    // Flip a byte at offset 10
    const corruptedCbor = Buffer.from(originalCbor);
    corruptedCbor[10] ^= 0xff;

    // Either CBOR decode fails or the opsDigest mismatches
    let decodeError = null;
    let decodedReceipt = null;
    try {
      decodedReceipt = cborDecode(corruptedCbor);
    } catch (err) {
      decodeError = err;
    }

    if (decodeError) {
      // CBOR decode failure — corruption detected
      expect(decodeError).toBeTruthy();
    } else {
      // CBOR decoded but fields are corrupted — opsDigest won't match
      // The receipt's opsDigest field should differ from what you'd compute
      // from the original ops, OR other fields are garbled
      expect(decodedReceipt).not.toEqual(receipt);
    }
  });
});

// ============================================================================
// Domain Separator Verification
// ============================================================================

describe('Audit Receipt Spec — Domain Separator', () => {
  it('opsDigest uses domain separator with null byte delimiter', () => {
    const ops = [
      { op: 'NodeAdd', target: 'test', result: 'applied' },
    ];
    const json = canonicalOpsJson(ops);

    // Compute with domain separator
    const withSeparator = computeOpsDigest(ops);

    // Compute without domain separator
    const withoutSeparator = createHash('sha256')
      .update(Buffer.from(json, 'utf8'))
      .digest('hex');

    // They MUST be different — domain separator prevents confusion
    expect(withSeparator).not.toBe(withoutSeparator);
  });

  it('domain separator contains literal null byte', () => {
    const prefix = 'git-warp:opsDigest:v1\0';
    const bytes = Buffer.from(prefix, 'utf8');
    // Last byte should be 0x00 (null)
    expect(bytes[bytes.length - 1]).toBe(0x00);
    // Total length: "git-warp:opsDigest:v1" (21 chars) + "\0" (1 byte) = 22
    expect(bytes.length).toBe(22);
  });
});

// ============================================================================
// CBOR Key Ordering
// ============================================================================

describe('Audit Receipt Spec — CBOR Key Ordering', () => {
  it('receipt CBOR keys are in lexicographic order', () => {
    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };

    // Encode and decode to verify key order
    const encoded = cborEncode(receipt);
    const decoded = /** @type {Record<string, unknown>} */ (cborDecode(encoded));
    const keys = Object.keys(decoded);

    // Expected canonical order
    const expectedOrder = [
      'dataCommit',
      'graphName',
      'opsDigest',
      'prevAuditCommit',
      'tickEnd',
      'tickStart',
      'timestamp',
      'version',
      'writerId',
    ];

    expect(keys).toEqual(expectedOrder);
  });
});

// ============================================================================
// Trailer Ordering
// ============================================================================

describe('Audit Receipt Spec — Trailer Rules', () => {
  it('trailer keys are in lexicographic order', () => {
    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
    const block = buildTrailerBlock(receipt);
    const keys = block
      .split('\n')
      .map((l) => l.split(': ')[0]);
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });

  it('no duplicate trailer keys in well-formed block', () => {
    const receipt = {
      version: 1,
      graphName: 'events',
      writerId: 'alice',
      dataCommit: 'a'.repeat(40),
      tickStart: 1,
      tickEnd: 1,
      opsDigest: '0'.repeat(64),
      prevAuditCommit: '0'.repeat(40),
      timestamp: 1768435200000,
    };
    const block = buildTrailerBlock(receipt);
    expect(checkDuplicateTrailers(block)).toBeNull();
  });
});
