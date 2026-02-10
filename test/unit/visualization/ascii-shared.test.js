/**
 * Unit tests for shared ASCII renderer utilities (formatters.js and symbols.js).
 *
 * Verifies the extracted shared modules produce the same output as the
 * former inline definitions in individual renderers.
 */

import { describe, it, expect } from 'vitest';
import { formatAge as _formatAge, formatNumber as _formatNumber, formatSha as _formatSha, formatWriterName as _formatWriterName } from '../../../src/visualization/renderers/ascii/formatters.js';
import { TIMELINE, ARROW, TREE } from '../../../src/visualization/renderers/ascii/symbols.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

/** @type {any} */ const formatAge = _formatAge;
/** @type {any} */ const formatNumber = _formatNumber;
/** @type {any} */ const formatSha = _formatSha;
/** @type {any} */ const formatWriterName = _formatWriterName;

describe('formatters', () => {
  describe('formatNumber', () => {
    it('formats integers with locale separators', () => {
      expect(formatNumber(1234567)).toBe('1,234,567');
    });

    it('formats zero', () => {
      expect(formatNumber(0)).toBe('0');
    });

    it('formats small numbers without separator', () => {
      expect(formatNumber(42)).toBe('42');
    });

    it('returns "0" for NaN', () => {
      expect(formatNumber(NaN)).toBe('0');
    });

    it('returns "0" for Infinity', () => {
      expect(formatNumber(Infinity)).toBe('0');
    });

    it('returns "0" for non-number types', () => {
      expect(formatNumber('hello')).toBe('0');
      expect(formatNumber(null)).toBe('0');
      expect(formatNumber(undefined)).toBe('0');
    });
  });

  describe('formatSha', () => {
    it('truncates to 7 characters with muted color', () => {
      const result = stripAnsi(formatSha('abc1234def5678'));
      expect(result).toBe('abc1234');
    });

    it('returns "none" for null', () => {
      const result = stripAnsi(formatSha(null));
      expect(result).toBe('none');
    });

    it('returns "none" for undefined', () => {
      const result = stripAnsi(formatSha(undefined));
      expect(result).toBe('none');
    });

    it('returns "none" for empty string', () => {
      const result = stripAnsi(formatSha(''));
      expect(result).toBe('none');
    });

    it('handles short SHAs gracefully', () => {
      const result = stripAnsi(formatSha('abc'));
      expect(result).toBe('abc');
    });
  });

  describe('formatAge', () => {
    it('formats seconds', () => {
      expect(formatAge(30)).toBe('30s');
    });

    it('formats minutes', () => {
      expect(formatAge(120)).toBe('2m');
    });

    it('formats hours', () => {
      expect(formatAge(7200)).toBe('2h');
    });

    it('formats days', () => {
      expect(formatAge(172800)).toBe('2d');
    });

    it('returns "unknown" for null', () => {
      expect(formatAge(null)).toBe('unknown');
    });

    it('returns "unknown" for undefined', () => {
      expect(formatAge(undefined)).toBe('unknown');
    });

    it('returns "unknown" for negative values', () => {
      expect(formatAge(-5)).toBe('unknown');
    });

    it('returns "unknown" for NaN', () => {
      expect(formatAge(NaN)).toBe('unknown');
    });

    it('returns "unknown" for Infinity', () => {
      expect(formatAge(Infinity)).toBe('unknown');
    });

    it('floors fractional seconds', () => {
      expect(formatAge(59.9)).toBe('59s');
    });

    it('formats zero seconds', () => {
      expect(formatAge(0)).toBe('0s');
    });
  });

  describe('formatWriterName', () => {
    it('returns writer ID unchanged when short enough', () => {
      expect(formatWriterName('alice')).toBe('alice');
    });

    it('truncates long writer IDs with ellipsis', () => {
      const longName = 'this-is-a-very-long-writer-name';
      const result = formatWriterName(longName, 16);
      expect(result.length).toBe(16);
      expect(result).toContain('\u2026');
    });

    it('returns "unknown" for null', () => {
      expect(formatWriterName(null)).toBe('unknown');
    });

    it('returns "unknown" for undefined', () => {
      expect(formatWriterName(undefined)).toBe('unknown');
    });

    it('returns "unknown" for empty string', () => {
      expect(formatWriterName('')).toBe('unknown');
    });

    it('respects custom max length', () => {
      const result = formatWriterName('abcdefghij', 5);
      expect(result.length).toBe(5);
      expect(result).toBe('abcd\u2026');
    });

    it('returns exact-length name unchanged', () => {
      expect(formatWriterName('abc', 3)).toBe('abc');
    });
  });
});

describe('symbols', () => {
  describe('TIMELINE', () => {
    it('has all expected keys', () => {
      expect(TIMELINE).toHaveProperty('vertical');
      expect(TIMELINE).toHaveProperty('dot');
      expect(TIMELINE).toHaveProperty('connector');
      expect(TIMELINE).toHaveProperty('end');
      expect(TIMELINE).toHaveProperty('top');
      expect(TIMELINE).toHaveProperty('line');
    });

    it('contains single Unicode characters', () => {
      for (const value of Object.values(TIMELINE)) {
        expect(typeof value).toBe('string');
        expect(value.length).toBe(1);
      }
    });

    it('vertical is U+2502 (│)', () => {
      expect(TIMELINE.vertical).toBe('\u2502');
    });

    it('dot is U+25CF (●)', () => {
      expect(TIMELINE.dot).toBe('\u25CF');
    });

    it('line is U+2500 (─)', () => {
      expect(TIMELINE.line).toBe('\u2500');
    });
  });

  describe('ARROW', () => {
    it('has all expected keys', () => {
      expect(ARROW).toHaveProperty('line');
      expect(ARROW).toHaveProperty('right');
      expect(ARROW).toHaveProperty('left');
      expect(ARROW).toHaveProperty('down');
      expect(ARROW).toHaveProperty('up');
    });

    it('right is U+25B6 (▶)', () => {
      expect(ARROW.right).toBe('\u25B6');
    });

    it('left is U+25C0 (◀)', () => {
      expect(ARROW.left).toBe('\u25C0');
    });

    it('down is U+25BC (▼)', () => {
      expect(ARROW.down).toBe('\u25BC');
    });

    it('up is U+25B2 (▲)', () => {
      expect(ARROW.up).toBe('\u25B2');
    });
  });

  describe('TREE', () => {
    it('has all expected keys', () => {
      expect(TREE).toHaveProperty('branch');
      expect(TREE).toHaveProperty('last');
      expect(TREE).toHaveProperty('vertical');
      expect(TREE).toHaveProperty('space');
    });

    it('branch is U+251C (├)', () => {
      expect(TREE.branch).toBe('\u251C');
    });

    it('last is U+2514 (└)', () => {
      expect(TREE.last).toBe('\u2514');
    });
  });
});
