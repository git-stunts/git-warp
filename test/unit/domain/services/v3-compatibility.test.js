import { describe, it, expect } from 'vitest';
import { isLegacyAnchor, isAnyAnchor } from '../../../../src/domain/services/LegacyAnchorDetector.js';
import { encodeAnchorMessage, detectMessageKind } from '../../../../src/domain/services/WarpMessageCodec.js';

/**
 * v3 Backward Compatibility Tests (Phase 5.4)
 *
 * WARP Spec Section 17 - Backward Compatibility Requirements:
 * - v4 tooling can detect and filter v3 JSON anchors ({"_type":"anchor"})
 * - v4 tooling can detect and filter v4 trailer anchors (eg-kind: anchor)
 * - Anchors are excluded from E-plane traversals
 * - Mixed anchor formats handled correctly
 */

describe('v3 Backward Compatibility', () => {
  describe('Legacy Anchor Detection', () => {
    it('detects v3 JSON anchor', () => {
      const v3Anchor = '{"_type":"anchor"}';
      expect(isLegacyAnchor(v3Anchor)).toBe(true);
    });

    it('detects v3 JSON anchor with extra fields', () => {
      const v3Anchor = '{"_type":"anchor","timestamp":"2024-01-01"}';
      expect(isLegacyAnchor(v3Anchor)).toBe(true);
    });

    it('rejects non-anchor JSON', () => {
      expect(isLegacyAnchor('{"_type":"node"}')).toBe(false);
      expect(isLegacyAnchor('{"name":"test"}')).toBe(false);
    });

    it('rejects non-JSON messages', () => {
      expect(isLegacyAnchor('plain text')).toBe(false);
      expect(isLegacyAnchor('warp:patch\n\neg-kind: patch')).toBe(false);
    });

    it('handles malformed JSON gracefully', () => {
      expect(isLegacyAnchor('{invalid')).toBe(false);
      expect(isLegacyAnchor('')).toBe(false);
      expect(isLegacyAnchor(/** @type {any} */ (null))).toBe(false);
    });
  });

  describe('Unified Anchor Detection', () => {
    it('detects v4 trailer anchor', () => {
      const v4Anchor = encodeAnchorMessage({ graph: 'test' });
      expect(isAnyAnchor(v4Anchor)).toBe(true);
    });

    it('detects v3 JSON anchor', () => {
      expect(isAnyAnchor('{"_type":"anchor"}')).toBe(true);
    });

    it('rejects regular patch messages', () => {
      const patchMsg = 'warp:patch\n\neg-kind: patch\neg-graph: test';
      expect(isAnyAnchor(patchMsg)).toBe(false);
    });

    it('rejects regular node messages', () => {
      expect(isAnyAnchor('Some node content')).toBe(false);
      expect(isAnyAnchor('{"data":"value"}')).toBe(false);
    });
  });

  describe('Mixed v3/v4 Scenarios', () => {
    const V3_COMMITS = [
      { sha: 'v3node1', message: 'Event 1', isAnchor: false },
      { sha: 'v3node2', message: 'Event 2', isAnchor: false },
      { sha: 'v3anchor', message: '{"_type":"anchor"}', isAnchor: true },
    ];

    const V4_COMMITS = [
      { sha: 'v4patch', message: 'warp:patch\n\neg-kind: patch\neg-graph: g', isAnchor: false },
      { sha: 'v4anchor', message: encodeAnchorMessage({ graph: 'g' }), isAnchor: true },
    ];

    it('filters anchors from mixed commit list', () => {
      const allCommits = [...V3_COMMITS, ...V4_COMMITS];
      const nonAnchors = allCommits.filter(c => !isAnyAnchor(c.message));

      expect(nonAnchors).toHaveLength(3); // 2 v3 nodes + 1 v4 patch
      expect(nonAnchors.map(c => c.sha)).toEqual(['v3node1', 'v3node2', 'v4patch']);
    });

    it('correctly identifies all anchor types', () => {
      const allCommits = [...V3_COMMITS, ...V4_COMMITS];
      const anchors = allCommits.filter(c => isAnyAnchor(c.message));

      expect(anchors).toHaveLength(2);
      expect(anchors.map(c => c.sha)).toEqual(['v3anchor', 'v4anchor']);
    });
  });

  describe('Edge Cases', () => {
    it('handles whitespace in v3 anchor', () => {
      expect(isLegacyAnchor('  {"_type":"anchor"}  ')).toBe(true);
      expect(isLegacyAnchor('\n{"_type":"anchor"}\n')).toBe(true);
    });

    it('handles _type with different casing (strict match)', () => {
      // Should be strict - only exact "_type" matches
      expect(isLegacyAnchor('{"_TYPE":"anchor"}')).toBe(false);
      expect(isLegacyAnchor('{"_type":"ANCHOR"}')).toBe(false);
    });

    it('handles nested objects', () => {
      expect(isLegacyAnchor('{"_type":"anchor","meta":{"nested":true}}')).toBe(true);
    });
  });

  describe('Integration with WarpMessageCodec', () => {
    it('v4 detectMessageKind returns anchor for v4 anchors', () => {
      const v4Anchor = encodeAnchorMessage({ graph: 'test' });
      expect(detectMessageKind(v4Anchor)).toBe('anchor');
    });

    it('v4 detectMessageKind returns null for v3 anchors', () => {
      // v3 anchors don't have trailer format, so detectMessageKind won't recognize them
      const v3Anchor = '{"_type":"anchor"}';
      expect(detectMessageKind(v3Anchor)).toBeNull();
    });

    it('isAnyAnchor fills the gap for v3 anchor detection', () => {
      // This demonstrates why isAnyAnchor is needed - detectMessageKind alone
      // cannot detect v3 anchors
      const v3Anchor = '{"_type":"anchor"}';
      expect(detectMessageKind(v3Anchor)).toBeNull(); // Not detected by v4 codec
      expect(isAnyAnchor(v3Anchor)).toBe(true); // Detected by unified detector
    });

    it('both detectors agree on v4 anchors', () => {
      const v4Anchor = encodeAnchorMessage({ graph: 'test' });
      expect(detectMessageKind(v4Anchor)).toBe('anchor');
      expect(isAnyAnchor(v4Anchor)).toBe(true);
    });
  });

  describe('Type Safety', () => {
    it('isLegacyAnchor handles undefined', () => {
      expect(isLegacyAnchor(/** @type {any} */ (undefined))).toBe(false);
    });

    it('isLegacyAnchor handles numbers', () => {
      expect(isLegacyAnchor(/** @type {any} */ (123))).toBe(false);
    });

    it('isLegacyAnchor handles objects', () => {
      expect(isLegacyAnchor(/** @type {any} */ ({ _type: 'anchor' }))).toBe(false);
    });

    it('isLegacyAnchor handles arrays', () => {
      expect(isLegacyAnchor(/** @type {any} */ (['{"_type":"anchor"}']))).toBe(false);
    });

    it('isAnyAnchor handles undefined', () => {
      expect(isAnyAnchor(/** @type {any} */ (undefined))).toBe(false);
    });

    it('isAnyAnchor handles numbers', () => {
      expect(isAnyAnchor(/** @type {any} */ (123))).toBe(false);
    });

    it('isAnyAnchor handles objects', () => {
      expect(isAnyAnchor(/** @type {any} */ ({ message: 'test' }))).toBe(false);
    });

    it('isAnyAnchor handles arrays', () => {
      expect(isAnyAnchor(/** @type {any} */ (['test']))).toBe(false);
    });
  });

  describe('E-plane Traversal Filtering', () => {
    it('simulates E-plane traversal with mixed anchors', () => {
      // Simulate a commit history with both v3 and v4 anchors interspersed
      const commitHistory = [
        { sha: 'sha1', message: '{"_type":"node","id":"1"}', type: 'v3-node' },
        { sha: 'sha2', message: '{"_type":"anchor"}', type: 'v3-anchor' },
        { sha: 'sha3', message: '{"_type":"node","id":"2"}', type: 'v3-node' },
        { sha: 'sha4', message: encodeAnchorMessage({ graph: 'test' }), type: 'v4-anchor' },
        { sha: 'sha5', message: 'warp:patch\n\neg-kind: patch\neg-graph: test\neg-writer: w1\neg-lamport: 1\neg-patch-oid: ' + 'a'.repeat(40) + '\neg-schema: 2', type: 'v4-patch' },
      ];

      // Filter out anchors for E-plane traversal
      const ePlaneCommits = commitHistory.filter(c => !isAnyAnchor(c.message));

      // Should only have non-anchor commits
      expect(ePlaneCommits).toHaveLength(3);
      expect(ePlaneCommits.map(c => c.type)).toEqual(['v3-node', 'v3-node', 'v4-patch']);
    });

    it('handles empty commit list', () => {
      /** @type {{sha: string, message: string}[]} */
      const commits = [];
      const filtered = commits.filter(c => !isAnyAnchor(c.message));
      expect(filtered).toHaveLength(0);
    });

    it('handles list with only anchors', () => {
      const commits = [
        { sha: 'sha1', message: '{"_type":"anchor"}' },
        { sha: 'sha2', message: encodeAnchorMessage({ graph: 'test' }) },
      ];
      const filtered = commits.filter(c => !isAnyAnchor(c.message));
      expect(filtered).toHaveLength(0);
    });

    it('handles list with no anchors', () => {
      const commits = [
        { sha: 'sha1', message: 'Regular commit' },
        { sha: 'sha2', message: '{"_type":"node"}' },
        { sha: 'sha3', message: 'Another commit' },
      ];
      const filtered = commits.filter(c => !isAnyAnchor(c.message));
      expect(filtered).toHaveLength(3);
    });
  });

  describe('Anchor Variations', () => {
    it('handles v3 anchor with additional metadata', () => {
      const anchors = [
        '{"_type":"anchor","version":3}',
        '{"_type":"anchor","created":"2024-01-01T00:00:00Z"}',
        '{"_type":"anchor","parents":["sha1","sha2"]}',
        '{"_type":"anchor","graph":"events","writer":"node-1"}',
      ];

      for (const anchor of anchors) {
        expect(isLegacyAnchor(anchor)).toBe(true);
        expect(isAnyAnchor(anchor)).toBe(true);
      }
    });

    it('handles v3 anchor with _type not first', () => {
      // JSON key order shouldn't matter
      expect(isLegacyAnchor('{"version":3,"_type":"anchor"}')).toBe(true);
      expect(isLegacyAnchor('{"meta":{},"_type":"anchor","data":null}')).toBe(true);
    });

    it('rejects v3-like JSON without _type', () => {
      expect(isLegacyAnchor('{"type":"anchor"}')).toBe(false);
      expect(isLegacyAnchor('{"kind":"anchor"}')).toBe(false);
    });

    it('rejects _type values that are not anchor', () => {
      const nonAnchors = [
        '{"_type":"node"}',
        '{"_type":"edge"}',
        '{"_type":"checkpoint"}',
        '{"_type":"patch"}',
        '{"_type":""}',
        '{"_type":null}',
        '{"_type":123}',
      ];

      for (const msg of nonAnchors) {
        expect(isLegacyAnchor(msg)).toBe(false);
        expect(isAnyAnchor(msg)).toBe(false);
      }
    });
  });
});
