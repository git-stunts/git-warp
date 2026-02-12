import { describe, it, expect } from 'vitest';
import {
  encodeAuditMessage,
  decodeAuditMessage,
} from '../../../../src/domain/services/AuditMessageCodec.js';

const VALID_INPUT = {
  graph: 'events',
  writer: 'alice',
  dataCommit: 'a'.repeat(40),
  opsDigest: '0'.repeat(64),
};

describe('AuditMessageCodec', () => {
  it('encode/decode round-trip', () => {
    const encoded = encodeAuditMessage(VALID_INPUT);
    const decoded = decodeAuditMessage(encoded);

    expect(decoded.kind).toBe('audit');
    expect(decoded.graph).toBe('events');
    expect(decoded.writer).toBe('alice');
    expect(decoded.dataCommit).toBe('a'.repeat(40));
    expect(decoded.opsDigest).toBe('0'.repeat(64));
    expect(decoded.schema).toBe(1);
  });

  it('title is warp:audit', () => {
    const encoded = encodeAuditMessage(VALID_INPUT);
    expect(encoded).toContain('warp:audit');
  });

  it('all 6 trailers in lex order', () => {
    const encoded = encodeAuditMessage(VALID_INPUT);
    const expectedOrder = [
      'eg-data-commit',
      'eg-graph',
      'eg-kind',
      'eg-ops-digest',
      'eg-schema',
      'eg-writer',
    ];

    let lastIndex = -1;
    for (const key of expectedOrder) {
      const idx = encoded.indexOf(key);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it('missing required trailer throws', () => {
    // Build a raw message with eg-data-commit missing
    const raw = [
      'warp:audit',
      '',
      'eg-graph: events',
      'eg-kind: audit',
      'eg-ops-digest: ' + '0'.repeat(64),
      'eg-schema: 1',
      'eg-writer: alice',
    ].join('\n');

    expect(() => decodeAuditMessage(raw)).toThrow('eg-data-commit');
  });

  it('decode rejects invalid dataCommit OID format', () => {
    const raw = [
      'warp:audit',
      '',
      'eg-data-commit: not-a-sha',
      'eg-graph: events',
      'eg-kind: audit',
      'eg-ops-digest: ' + '0'.repeat(64),
      'eg-schema: 1',
      'eg-writer: alice',
    ].join('\n');

    expect(() => decodeAuditMessage(raw)).toThrow();
  });

  it('decode rejects invalid opsDigest format', () => {
    const raw = [
      'warp:audit',
      '',
      'eg-data-commit: ' + 'a'.repeat(40),
      'eg-graph: events',
      'eg-kind: audit',
      'eg-ops-digest: tooshort',
      'eg-schema: 1',
      'eg-writer: alice',
    ].join('\n');

    expect(() => decodeAuditMessage(raw)).toThrow();
  });

  it('decode rejects non-integer schema', () => {
    const raw = [
      'warp:audit',
      '',
      'eg-data-commit: ' + 'a'.repeat(40),
      'eg-graph: events',
      'eg-kind: audit',
      'eg-ops-digest: ' + '0'.repeat(64),
      'eg-schema: 1.5',
      'eg-writer: alice',
    ].join('\n');

    expect(() => decodeAuditMessage(raw)).toThrow();
  });

  it('unknown eg-schema version throws', () => {
    const raw = [
      'warp:audit',
      '',
      'eg-data-commit: ' + 'a'.repeat(40),
      'eg-graph: events',
      'eg-kind: audit',
      'eg-ops-digest: ' + '0'.repeat(64),
      'eg-schema: 2',
      'eg-writer: alice',
    ].join('\n');

    expect(() => decodeAuditMessage(raw)).toThrow(
      'Unsupported audit schema version',
    );
  });
});
