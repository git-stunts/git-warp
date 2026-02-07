/**
 * Unit tests for visualization utility functions.
 *
 * These are pure-function tests (not snapshots) covering truncate,
 * timeAgo, formatDuration, padRight, padLeft, center, progressBar,
 * and stripAnsi.
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { truncate } from '../../../src/visualization/utils/truncate.js';
import { timeAgo, formatDuration } from '../../../src/visualization/utils/time.js';
import { padRight, padLeft, center } from '../../../src/visualization/utils/unicode.js';
import { progressBar } from '../../../src/visualization/renderers/ascii/progress.js';
import { stripAnsi } from '../../../src/visualization/utils/ansi.js';

// Fixed "now" for deterministic timeAgo tests
const FIXED_NOW = new Date('2025-01-15T12:00:00Z').getTime();

beforeAll(() => {
  vi.spyOn(Date, 'now').mockImplementation(() => FIXED_NOW);
});

afterAll(() => {
  vi.restoreAllMocks();
});

describe('truncate', () => {
  it('returns string unchanged when shorter than max', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('returns string unchanged when at exact width', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('truncates string longer than max with ellipsis', () => {
    const result = truncate('hello world', 8);
    expect(result).toBe('hello w…');
  });

  it('returns empty string when maxWidth is 0', () => {
    expect(truncate('hello', 0)).toBe('');
  });

  it('returns empty string when maxWidth is negative', () => {
    expect(truncate('hello', -5)).toBe('');
  });

  it('handles maxWidth equal to ellipsis width', () => {
    // Default ellipsis '…' has width 1
    expect(truncate('hello', 1)).toBe('…');
  });

  it('handles empty string', () => {
    expect(truncate('', 10)).toBe('');
  });

  it('handles custom ellipsis', () => {
    const result = truncate('hello world', 8, '...');
    expect(result).toBe('hello...');
  });

  it('handles CJK characters (width 2)', () => {
    // Each CJK character is width 2 — '你好世界' = width 8
    const result = truncate('你好世界', 5);
    expect(result).toBe('你好…');
  });
});

describe('timeAgo', () => {
  it('returns seconds for < 60s ago', () => {
    const date = new Date(FIXED_NOW - 45_000).toISOString();
    expect(timeAgo(date)).toBe('45s ago');
  });

  it('returns 0s for exact now', () => {
    const date = new Date(FIXED_NOW).toISOString();
    expect(timeAgo(date)).toBe('0s ago');
  });

  it('returns minutes for 1-59m ago', () => {
    const date = new Date(FIXED_NOW - 5 * 60_000).toISOString();
    expect(timeAgo(date)).toBe('5m ago');
  });

  it('returns hours for 1-23h ago', () => {
    const date = new Date(FIXED_NOW - 3 * 3_600_000).toISOString();
    expect(timeAgo(date)).toBe('3h ago');
  });

  it('returns days for >= 24h ago', () => {
    const date = new Date(FIXED_NOW - 2 * 86_400_000).toISOString();
    expect(timeAgo(date)).toBe('2d ago');
  });

  it('returns "unknown" for invalid date', () => {
    expect(timeAgo('not-a-date')).toBe('unknown');
  });

  it('handles null (epoch 0 is a valid date)', () => {
    // new Date(null) → epoch 0, which is a valid timestamp
    expect(timeAgo(null)).toMatch(/\d+d ago/);
  });

  it('accepts a Date object', () => {
    const date = new Date(FIXED_NOW - 30_000);
    expect(timeAgo(date)).toBe('30s ago');
  });

  it('accepts an ISO string', () => {
    // 60 seconds = 1 minute boundary
    expect(timeAgo('2025-01-15T11:59:00Z')).toBe('1m ago');
  });
});

describe('formatDuration', () => {
  it('returns milliseconds for < 1000', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('returns 0ms for zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('returns seconds for >= 1s and < 60s', () => {
    expect(formatDuration(45_000)).toBe('45s');
  });

  it('returns exactly 1s at 1000ms', () => {
    expect(formatDuration(1000)).toBe('1s');
  });

  it('returns minutes + seconds for >= 60s', () => {
    expect(formatDuration(90_000)).toBe('1m 30s');
  });

  it('returns minutes with 0 remainder seconds', () => {
    expect(formatDuration(120_000)).toBe('2m 0s');
  });
});

describe('padRight', () => {
  it('pads short string to target width', () => {
    expect(padRight('hi', 5)).toBe('hi   ');
  });

  it('returns original string when already at width', () => {
    expect(padRight('hello', 5)).toBe('hello');
  });

  it('returns original string when longer than width', () => {
    expect(padRight('hello world', 5)).toBe('hello world');
  });

  it('uses custom pad character', () => {
    expect(padRight('hi', 5, '-')).toBe('hi---');
  });
});

describe('padLeft', () => {
  it('pads short string on the left', () => {
    expect(padLeft('hi', 5)).toBe('   hi');
  });

  it('returns original string when already at width', () => {
    expect(padLeft('hello', 5)).toBe('hello');
  });

  it('returns original string when longer than width', () => {
    expect(padLeft('hello world', 5)).toBe('hello world');
  });

  it('uses custom pad character', () => {
    expect(padLeft('42', 5, '0')).toBe('00042');
  });
});

describe('center', () => {
  it('centers string with even padding', () => {
    expect(center('hi', 6)).toBe('  hi  ');
  });

  it('centers string with odd padding (left gets floor, right gets ceil)', () => {
    expect(center('hi', 5)).toBe(' hi  ');
  });

  it('returns original string when already at width', () => {
    expect(center('hello', 5)).toBe('hello');
  });

  it('returns original string when longer than width', () => {
    expect(center('hello world', 5)).toBe('hello world');
  });

  it('uses custom pad character', () => {
    expect(center('X', 5, '-')).toBe('--X--');
  });
});

describe('progressBar', () => {
  it('renders 0% bar', () => {
    const result = stripAnsi(progressBar(0, 10));
    expect(result).toBe('░░░░░░░░░░ 0%');
  });

  it('renders 50% bar', () => {
    const result = stripAnsi(progressBar(50, 10));
    expect(result).toBe('█████░░░░░ 50%');
  });

  it('renders 100% bar', () => {
    const result = stripAnsi(progressBar(100, 10));
    expect(result).toBe('██████████ 100%');
  });

  it('clamps negative percent to 0', () => {
    const result = stripAnsi(progressBar(-10, 10));
    expect(result).toBe('░░░░░░░░░░ 0%');
  });

  it('clamps percent > 100 to 100', () => {
    const result = stripAnsi(progressBar(150, 10));
    expect(result).toBe('██████████ 100%');
  });

  it('respects custom width', () => {
    const result = stripAnsi(progressBar(50, 20));
    expect(result).toBe('██████████░░░░░░░░░░ 50%');
  });

  it('hides percent when showPercent is false', () => {
    const result = stripAnsi(progressBar(50, 10, { showPercent: false }));
    expect(result).toBe('█████░░░░░');
  });

  it('uses default width of 20', () => {
    const result = stripAnsi(progressBar(50));
    expect(result).toBe('██████████░░░░░░░░░░ 50%');
  });
});

describe('stripAnsi', () => {
  it('strips ANSI escape codes from colored string', () => {
    const colored = '\u001b[31mred text\u001b[0m';
    expect(stripAnsi(colored)).toBe('red text');
  });

  it('returns plain string unchanged', () => {
    expect(stripAnsi('hello')).toBe('hello');
  });

  it('handles empty string', () => {
    expect(stripAnsi('')).toBe('');
  });
});
