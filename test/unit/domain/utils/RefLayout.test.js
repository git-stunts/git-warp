import { describe, it, expect } from 'vitest';
import {
  REF_PREFIX,
  MAX_WRITER_ID_LENGTH,
  buildWriterRef,
  buildCheckpointRef,
  buildCoverageRef,
  buildWritersPrefix,
  buildSeekCacheRef,
  buildCursorActiveRef,
  buildCursorSavedRef,
  buildCursorSavedPrefix,
  parseWriterIdFromRef as _parseWriterIdFromRef,
  validateGraphName as _validateGraphName,
  validateWriterId as _validateWriterId,
} from '../../../../src/domain/utils/RefLayout.js';

/** @type {any} */
const parseWriterIdFromRef = _parseWriterIdFromRef;
/** @type {any} */
const validateGraphName = _validateGraphName;
/** @type {any} */
const validateWriterId = _validateWriterId;

describe('RefLayout', () => {
  describe('constants', () => {
    it('REF_PREFIX is refs/warp', () => {
      expect(REF_PREFIX).toBe('refs/warp');
    });

    it('MAX_WRITER_ID_LENGTH is 64', () => {
      expect(MAX_WRITER_ID_LENGTH).toBe(64);
    });
  });

  describe('validateGraphName', () => {
    it('accepts valid simple graph names', () => {
      expect(() => validateGraphName('events')).not.toThrow();
      expect(() => validateGraphName('my-graph')).not.toThrow();
      expect(() => validateGraphName('graph_v2')).not.toThrow();
      expect(() => validateGraphName('Graph123')).not.toThrow();
      expect(() => validateGraphName('a')).not.toThrow();
    });

    it('accepts graph names with forward slashes (nested paths)', () => {
      expect(() => validateGraphName('team/events')).not.toThrow();
      expect(() => validateGraphName('org/team/graph')).not.toThrow();
    });

    it('rejects empty string', () => {
      expect(() => validateGraphName('')).toThrow('Invalid graph name: cannot be empty');
    });

    it('rejects path traversal sequences', () => {
      expect(() => validateGraphName('../etc')).toThrow("contains path traversal sequence '..'");
      expect(() => validateGraphName('foo/../bar')).toThrow("contains path traversal sequence '..'");
      expect(() => validateGraphName('..')).toThrow("contains path traversal sequence '..'");
      expect(() => validateGraphName('a..b')).toThrow("contains path traversal sequence '..'");
    });

    it('rejects semicolons', () => {
      expect(() => validateGraphName('graph;drop')).toThrow('contains semicolon');
      expect(() => validateGraphName(';')).toThrow('contains semicolon');
    });

    it('rejects spaces', () => {
      expect(() => validateGraphName('my graph')).toThrow('contains space');
      expect(() => validateGraphName(' leading')).toThrow('contains space');
      expect(() => validateGraphName('trailing ')).toThrow('contains space');
    });

    it('rejects null bytes', () => {
      expect(() => validateGraphName('graph\0name')).toThrow('contains null byte');
      expect(() => validateGraphName('\0')).toThrow('contains null byte');
    });

    it('rejects non-string inputs', () => {
      expect(() => validateGraphName(null)).toThrow('expected string, got object');
      expect(() => validateGraphName(undefined)).toThrow('expected string, got undefined');
      expect(() => validateGraphName(123)).toThrow('expected string, got number');
      expect(() => validateGraphName({})).toThrow('expected string, got object');
      expect(() => validateGraphName([])).toThrow('expected string, got object');
    });

    it('accepts single dot (not path traversal)', () => {
      expect(() => validateGraphName('.')).not.toThrow();
      expect(() => validateGraphName('.hidden')).not.toThrow();
      expect(() => validateGraphName('file.txt')).not.toThrow();
    });
  });

  describe('validateWriterId', () => {
    it('accepts valid writer IDs', () => {
      expect(() => validateWriterId('node-1')).not.toThrow();
      expect(() => validateWriterId('alice')).not.toThrow();
      expect(() => validateWriterId('Writer_01')).not.toThrow();
      expect(() => validateWriterId('a.b.c')).not.toThrow();
      expect(() => validateWriterId('ABC123')).not.toThrow();
      expect(() => validateWriterId('a')).not.toThrow();
      expect(() => validateWriterId('_')).not.toThrow();
      expect(() => validateWriterId('-')).not.toThrow();
      expect(() => validateWriterId('.')).not.toThrow();
    });

    it('accepts writer ID at max length (64 chars)', () => {
      const maxLengthId = 'a'.repeat(64);
      expect(() => validateWriterId(maxLengthId)).not.toThrow();
    });

    it('rejects empty string', () => {
      expect(() => validateWriterId('')).toThrow('Invalid writer ID: cannot be empty');
    });

    it('rejects writer ID exceeding max length', () => {
      const tooLongId = 'x'.repeat(65);
      expect(() => validateWriterId(tooLongId)).toThrow(
        `Invalid writer ID: exceeds maximum length of ${MAX_WRITER_ID_LENGTH} characters: 65`
      );
    });

    it('rejects forward slashes', () => {
      expect(() => validateWriterId('a/b')).toThrow('contains forward slash');
      expect(() => validateWriterId('/leading')).toThrow('contains forward slash');
      expect(() => validateWriterId('trailing/')).toThrow('contains forward slash');
    });

    it('rejects path traversal sequences', () => {
      expect(() => validateWriterId('..')).toThrow("contains path traversal sequence '..'");
      expect(() => validateWriterId('a..b')).toThrow("contains path traversal sequence '..'");
    });

    it('rejects null bytes', () => {
      expect(() => validateWriterId('writer\0id')).toThrow('contains null byte');
      expect(() => validateWriterId('\0')).toThrow('contains null byte');
    });

    it('rejects whitespace', () => {
      expect(() => validateWriterId('writer id')).toThrow('contains whitespace');
      expect(() => validateWriterId('writer\tid')).toThrow('contains whitespace');
      expect(() => validateWriterId('writer\nid')).toThrow('contains whitespace');
      expect(() => validateWriterId(' ')).toThrow('contains whitespace');
    });

    it('rejects non-ASCII characters', () => {
      expect(() => validateWriterId('writer@name')).toThrow('contains invalid characters');
      expect(() => validateWriterId('writer#1')).toThrow('contains invalid characters');
      expect(() => validateWriterId('writer$')).toThrow('contains invalid characters');
      expect(() => validateWriterId('writer%20')).toThrow('contains invalid characters');
      expect(() => validateWriterId('cafe\u0301')).toThrow('contains invalid characters'); // combining accent
      expect(() => validateWriterId('\u00e9')).toThrow('contains invalid characters'); // é
    });

    it('rejects non-string inputs', () => {
      expect(() => validateWriterId(null)).toThrow('expected string, got object');
      expect(() => validateWriterId(undefined)).toThrow('expected string, got undefined');
      expect(() => validateWriterId(123)).toThrow('expected string, got number');
      expect(() => validateWriterId({})).toThrow('expected string, got object');
    });
  });

  describe('buildWriterRef', () => {
    it('builds correct writer ref path', () => {
      expect(buildWriterRef('events', 'node-1')).toBe('refs/warp/events/writers/node-1');
    });

    it('builds writer ref for various valid inputs', () => {
      expect(buildWriterRef('my-graph', 'alice')).toBe('refs/warp/my-graph/writers/alice');
      expect(buildWriterRef('Graph_v2', 'Writer_01')).toBe(
        'refs/warp/Graph_v2/writers/Writer_01'
      );
    });

    it('builds writer ref for nested graph names', () => {
      expect(buildWriterRef('team/events', 'writer-1')).toBe(
        'refs/warp/team/events/writers/writer-1'
      );
    });

    it('throws for invalid graph name', () => {
      expect(() => buildWriterRef('../etc', 'alice')).toThrow("contains path traversal sequence '..'");
      expect(() => buildWriterRef('', 'alice')).toThrow('cannot be empty');
    });

    it('throws for invalid writer ID', () => {
      expect(() => buildWriterRef('events', 'a/b')).toThrow('contains forward slash');
      expect(() => buildWriterRef('events', '')).toThrow('cannot be empty');
      expect(() => buildWriterRef('events', 'x'.repeat(65))).toThrow('exceeds maximum length');
    });
  });

  describe('buildCheckpointRef', () => {
    it('builds correct checkpoint ref path', () => {
      expect(buildCheckpointRef('events')).toBe('refs/warp/events/checkpoints/head');
    });

    it('builds checkpoint ref for various graph names', () => {
      expect(buildCheckpointRef('my-graph')).toBe('refs/warp/my-graph/checkpoints/head');
      expect(buildCheckpointRef('team/events')).toBe(
        'refs/warp/team/events/checkpoints/head'
      );
    });

    it('throws for invalid graph name', () => {
      expect(() => buildCheckpointRef('../etc')).toThrow("contains path traversal sequence '..'");
      expect(() => buildCheckpointRef('')).toThrow('cannot be empty');
      expect(() => buildCheckpointRef('my graph')).toThrow('contains space');
    });
  });

  describe('buildCoverageRef', () => {
    it('builds correct coverage ref path', () => {
      expect(buildCoverageRef('events')).toBe('refs/warp/events/coverage/head');
    });

    it('builds coverage ref for various graph names', () => {
      expect(buildCoverageRef('my-graph')).toBe('refs/warp/my-graph/coverage/head');
      expect(buildCoverageRef('team/events')).toBe('refs/warp/team/events/coverage/head');
    });

    it('throws for invalid graph name', () => {
      expect(() => buildCoverageRef('../etc')).toThrow("contains path traversal sequence '..'");
      expect(() => buildCoverageRef('')).toThrow('cannot be empty');
    });
  });

  describe('buildWritersPrefix', () => {
    it('builds correct writers prefix path', () => {
      expect(buildWritersPrefix('events')).toBe('refs/warp/events/writers/');
    });

    it('builds writers prefix with trailing slash', () => {
      const prefix = buildWritersPrefix('my-graph');
      expect(prefix).toBe('refs/warp/my-graph/writers/');
      expect(prefix.endsWith('/')).toBe(true);
    });

    it('builds writers prefix for nested graph names', () => {
      expect(buildWritersPrefix('team/events')).toBe('refs/warp/team/events/writers/');
    });

    it('throws for invalid graph name', () => {
      expect(() => buildWritersPrefix('../etc')).toThrow("contains path traversal sequence '..'");
      expect(() => buildWritersPrefix('')).toThrow('cannot be empty');
    });
  });

  describe('parseWriterIdFromRef', () => {
    it('parses writer ID from valid writer ref', () => {
      expect(parseWriterIdFromRef('refs/warp/events/writers/alice')).toBe('alice');
    });

    it('parses various writer IDs', () => {
      expect(parseWriterIdFromRef('refs/warp/events/writers/node-1')).toBe('node-1');
      expect(parseWriterIdFromRef('refs/warp/my-graph/writers/Writer_01')).toBe('Writer_01');
      expect(parseWriterIdFromRef('refs/warp/Graph123/writers/a.b.c')).toBe('a.b.c');
    });

    it('parses writer ID from nested graph path', () => {
      expect(parseWriterIdFromRef('refs/warp/team/events/writers/writer-1')).toBe(
        'writer-1'
      );
    });

    it('returns null for non-writer refs', () => {
      expect(parseWriterIdFromRef('refs/warp/events/checkpoints/head')).toBeNull();
      expect(parseWriterIdFromRef('refs/warp/events/coverage/head')).toBeNull();
    });

    it('returns null for refs outside warp namespace', () => {
      expect(parseWriterIdFromRef('refs/heads/main')).toBeNull();
      expect(parseWriterIdFromRef('refs/tags/v1.0')).toBeNull();
      expect(parseWriterIdFromRef('refs/other/events/writers/alice')).toBeNull();
    });

    it('returns null for malformed writer refs', () => {
      // Missing writer ID
      expect(parseWriterIdFromRef('refs/warp/events/writers/')).toBeNull();
      expect(parseWriterIdFromRef('refs/warp/events/writers')).toBeNull();

      // Extra segments after writer ID
      expect(parseWriterIdFromRef('refs/warp/events/writers/alice/extra')).toBeNull();

      // Invalid prefix
      expect(parseWriterIdFromRef('warp/events/writers/alice')).toBeNull();
    });

    it('returns null for refs with invalid writer IDs', () => {
      // Writer ID with forward slash would create extra segment
      expect(parseWriterIdFromRef('refs/warp/events/writers/a/b')).toBeNull();

      // Empty writer ID
      expect(parseWriterIdFromRef('refs/warp/events/writers/')).toBeNull();
    });

    it('returns null for non-string inputs', () => {
      expect(parseWriterIdFromRef(null)).toBeNull();
      expect(parseWriterIdFromRef(undefined)).toBeNull();
      expect(parseWriterIdFromRef(123)).toBeNull();
      expect(parseWriterIdFromRef({})).toBeNull();
    });

    it('returns null for empty string', () => {
      expect(parseWriterIdFromRef('')).toBeNull();
    });

    it('returns null when writers appears at wrong position', () => {
      // Writers as first segment (no graph name)
      expect(parseWriterIdFromRef('refs/warp/writers/alice')).toBeNull();
    });
  });

  describe('integration: builder + parser round-trip', () => {
    it('parseWriterIdFromRef extracts ID from buildWriterRef output', () => {
      const graphName = 'my-events';
      const writerId = 'producer-1';

      const ref = buildWriterRef(graphName, writerId);
      const parsed = parseWriterIdFromRef(ref);

      expect(parsed).toBe(writerId);
    });

    it('round-trips various writer IDs', () => {
      const testCases = [
        { graph: 'events', writer: 'alice' },
        { graph: 'prod-graph', writer: 'node_01' },
        { graph: 'team/shared', writer: 'writer.v2' },
        { graph: 'g', writer: 'w' },
        { graph: 'Graph', writer: 'a'.repeat(64) },
      ];

      for (const { graph, writer } of testCases) {
        const ref = buildWriterRef(graph, writer);
        const parsed = parseWriterIdFromRef(ref);
        expect(parsed).toBe(writer);
      }
    });
  });

  describe('edge cases', () => {
    it('handles single-character names', () => {
      expect(buildWriterRef('g', 'w')).toBe('refs/warp/g/writers/w');
      expect(buildCheckpointRef('g')).toBe('refs/warp/g/checkpoints/head');
      expect(buildCoverageRef('g')).toBe('refs/warp/g/coverage/head');
      expect(buildWritersPrefix('g')).toBe('refs/warp/g/writers/');
    });

    it('handles graph name with periods', () => {
      expect(() => validateGraphName('graph.v1')).not.toThrow();
      expect(buildWriterRef('graph.v1', 'writer')).toBe(
        'refs/warp/graph.v1/writers/writer'
      );
    });

    it('handles writer ID that is all special chars', () => {
      expect(() => validateWriterId('---')).not.toThrow();
      expect(() => validateWriterId('___')).not.toThrow();
      expect(() => validateWriterId('...')).toThrow(); // still invalid due to .. substring
      expect(() => validateWriterId('._-')).not.toThrow();
    });

    it('distinguishes single dot from double dot', () => {
      // Single dots are fine
      expect(() => validateGraphName('.')).not.toThrow();
      expect(() => validateGraphName('a.b')).not.toThrow();
      expect(() => validateWriterId('.')).not.toThrow();
      expect(() => validateWriterId('a.b')).not.toThrow();

      // Double dots are rejected
      expect(() => validateGraphName('..')).toThrow();
      expect(() => validateGraphName('a..b')).toThrow();
      expect(() => validateWriterId('..')).toThrow();
      expect(() => validateWriterId('a..b')).toThrow();
    });

    it('handles numeric-only names', () => {
      expect(() => validateGraphName('123')).not.toThrow();
      expect(() => validateWriterId('123')).not.toThrow();
      expect(buildWriterRef('123', '456')).toBe('refs/warp/123/writers/456');
    });
  });

  describe('buildSeekCacheRef', () => {
    it('builds correct ref path', () => {
      expect(buildSeekCacheRef('events')).toBe('refs/warp/events/seek-cache');
    });

    it('validates graph name', () => {
      expect(() => buildSeekCacheRef('')).toThrow();
      expect(() => buildSeekCacheRef('../bad')).toThrow();
    });
  });

  describe('buildCursorActiveRef', () => {
    it('builds correct cursor active ref path', () => {
      expect(buildCursorActiveRef('events')).toBe('refs/warp/events/cursor/active');
    });

    it('builds cursor active ref for nested graph names', () => {
      expect(buildCursorActiveRef('team/events')).toBe(
        'refs/warp/team/events/cursor/active'
      );
    });

    it('throws for invalid graph name', () => {
      expect(() => buildCursorActiveRef('')).toThrow('cannot be empty');
      expect(() => buildCursorActiveRef('../etc')).toThrow(
        "contains path traversal sequence '..'"
      );
      expect(() => buildCursorActiveRef('my graph')).toThrow('contains space');
    });
  });

  describe('buildCursorSavedRef', () => {
    it('builds correct cursor saved ref path', () => {
      expect(buildCursorSavedRef('events', 'before-tui')).toBe(
        'refs/warp/events/cursor/saved/before-tui'
      );
    });

    it('builds saved ref for various valid inputs', () => {
      expect(buildCursorSavedRef('my-graph', 'snap_01')).toBe(
        'refs/warp/my-graph/cursor/saved/snap_01'
      );
      expect(buildCursorSavedRef('team/events', 'checkpoint.v2')).toBe(
        'refs/warp/team/events/cursor/saved/checkpoint.v2'
      );
    });

    it('throws for invalid graph name', () => {
      expect(() => buildCursorSavedRef('../etc', 'name')).toThrow(
        "contains path traversal sequence '..'"
      );
      expect(() => buildCursorSavedRef('', 'name')).toThrow('cannot be empty');
    });

    it('throws for invalid cursor name', () => {
      expect(() => buildCursorSavedRef('events', '')).toThrow('cannot be empty');
      expect(() => buildCursorSavedRef('events', 'a/b')).toThrow('contains forward slash');
      expect(() => buildCursorSavedRef('events', 'x'.repeat(65))).toThrow(
        'exceeds maximum length'
      );
      expect(() => buildCursorSavedRef('events', 'has space')).toThrow(
        'contains whitespace'
      );
    });
  });

  describe('buildCursorSavedPrefix', () => {
    it('builds correct cursor saved prefix path', () => {
      expect(buildCursorSavedPrefix('events')).toBe('refs/warp/events/cursor/saved/');
    });

    it('builds prefix with trailing slash', () => {
      const prefix = buildCursorSavedPrefix('my-graph');
      expect(prefix).toBe('refs/warp/my-graph/cursor/saved/');
      expect(prefix.endsWith('/')).toBe(true);
    });

    it('builds prefix for nested graph names', () => {
      expect(buildCursorSavedPrefix('team/events')).toBe(
        'refs/warp/team/events/cursor/saved/'
      );
    });

    it('throws for invalid graph name', () => {
      expect(() => buildCursorSavedPrefix('')).toThrow('cannot be empty');
      expect(() => buildCursorSavedPrefix('../etc')).toThrow(
        "contains path traversal sequence '..'"
      );
      expect(() => buildCursorSavedPrefix('my graph')).toThrow('contains space');
    });
  });
});
