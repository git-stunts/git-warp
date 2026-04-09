import { describe, it, expect } from 'vitest';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.js';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';

/**
 * ADR 1-T12: Reserved-byte validation rejects ambiguous identifiers.
 */

function makeBuilder(opts = /** @type {any} */ ({})) {
  return new PatchBuilder(/** @type {any} */ ({
    writerId: opts.writerId ?? 'w1',
    lamport: opts.lamport ?? 1,
    versionVector: opts.versionVector ?? VersionVector.empty(),
    getCurrentState: opts.getCurrentState ?? (() => null),
  }));
}

describe('PatchBuilder — reserved-byte validation (ADR 1-T12)', () => {
  // ----- addNode -----
  describe('addNode', () => {
    it('rejects node ID containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.addNode('bad\0id')).toThrow(/null bytes/);
    });

    it('rejects node ID starting with \\x01', () => {
      const builder = makeBuilder();
      expect(() => builder.addNode('\x01bad')).toThrow(/reserved prefix/);
    });

    it('accepts normal node IDs', () => {
      const builder = makeBuilder();
      expect(() => builder.addNode('user:alice')).not.toThrow();
      expect(() => builder.addNode('123-abc')).not.toThrow();
      expect(() => builder.addNode('café')).not.toThrow();
    });
  });

  // ----- addEdge -----
  describe('addEdge', () => {
    it('rejects from node ID containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('bad\0from', 'to', 'label')).toThrow(/null bytes/);
    });

    it('rejects to node ID containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('from', 'bad\0to', 'label')).toThrow(/null bytes/);
    });

    it('rejects label containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('from', 'to', 'bad\0label')).toThrow(/null bytes/);
    });

    it('rejects from node ID starting with \\x01', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('\x01from', 'to', 'label')).toThrow(/reserved prefix/);
    });

    it('rejects to node ID starting with \\x01', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('from', '\x01to', 'label')).toThrow(/reserved prefix/);
    });

    it('rejects label starting with \\x01', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('from', 'to', '\x01label')).toThrow(/reserved prefix/);
    });

    it('accepts normal edge identifiers', () => {
      const builder = makeBuilder();
      expect(() => builder.addEdge('user:alice', 'user:bob', 'follows')).not.toThrow();
    });
  });

  // ----- setProperty -----
  describe('setProperty', () => {
    it('rejects node ID containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.setProperty('bad\0id', 'key', 'val')).toThrow(/null bytes/);
    });

    it('rejects node ID starting with \\x01', () => {
      const builder = makeBuilder();
      expect(() => builder.setProperty('\x01bad', 'key', 'val')).toThrow(/reserved prefix/);
    });

    it('rejects property key containing \\0', () => {
      const builder = makeBuilder();
      expect(() => builder.setProperty('node', 'bad\0key', 'val')).toThrow(/null bytes/);
    });

    it('accepts normal property identifiers', () => {
      const builder = makeBuilder();
      expect(() => builder.setProperty('user:alice', 'name', 'Alice')).not.toThrow();
    });
  });

  // ----- setEdgeProperty -----
  describe('setEdgeProperty', () => {
    it('rejects from node ID containing \\0', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('bad\0from', 'to', 'label', 'k', 'v'))
        .toThrow(/null bytes/);
    });

    it('rejects to node ID containing \\0', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', 'bad\0to', 'label', 'k', 'v'))
        .toThrow(/null bytes/);
    });

    it('rejects label containing \\0', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', 'to', 'bad\0label', 'k', 'v'))
        .toThrow(/null bytes/);
    });

    it('rejects property key containing \\0', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', 'to', 'label', 'bad\0key', 'v'))
        .toThrow(/null bytes/);
    });

    it('rejects from node ID starting with \\x01', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('\x01from', 'to', 'label', 'k', 'v'))
        .toThrow(/reserved prefix/);
    });

    it('rejects to node ID starting with \\x01', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', '\x01to', 'label', 'k', 'v'))
        .toThrow(/reserved prefix/);
    });

    it('rejects label starting with \\x01', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', 'to', '\x01label', 'k', 'v'))
        .toThrow(/reserved prefix/);
    });

    it('rejects property key starting with \\x01', () => {
      const builder = makeBuilder();
      builder.addEdge('from', 'to', 'label');
      expect(() => builder.setEdgeProperty('from', 'to', 'label', '\x01k', 'v'))
        .toThrow(/reserved prefix/);
    });

    it('accepts normal edge property identifiers', () => {
      const builder = makeBuilder();
      builder.addEdge('a', 'b', 'rel');
      expect(() => builder.setEdgeProperty('a', 'b', 'rel', 'weight', 1.0)).not.toThrow();
    });
  });
});
