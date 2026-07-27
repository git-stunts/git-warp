import { describe, expect, it } from 'vitest';

import {
  formatV18MigrationBytes,
  formatV18MigrationPreflight,
  parseV18MigrationObjectBytes,
} from '../../../scripts/v18-to-v19/V18MigrationPreflight.ts';

describe('v18 migration preflight', () => {
  it('counts loose, packed, and garbage object storage', () => {
    expect(
      parseV18MigrationObjectBytes(
        [
          'count: 7',
          'size: 3',
          'in-pack: 10',
          'packs: 1',
          'size-pack: 11',
          'prune-packable: 0',
          'garbage: 1',
          'size-garbage: 5',
        ].join('\n')
      )
    ).toBe(19n * 1_024n);
  });

  it('formats binary byte units without floating point', () => {
    expect(formatV18MigrationBytes(0n)).toBe('0 B');
    expect(formatV18MigrationBytes(1_536n)).toBe('1.5 KiB');
    expect(formatV18MigrationBytes(81n * 1_048_576n)).toBe('81.0 MiB');
  });

  it('makes an insufficient scratch volume conspicuous', () => {
    expect(
      formatV18MigrationPreflight({
        repositoryObjectBytes: 100n,
        scratchAvailableBytes: 150n,
        scratchMinimumBytes: 200n,
        scratchPath: '/scratch',
        scratchSufficient: false,
        sourceAvailableBytes: 300n,
        sourceGitDirectory: '/repo/.git',
      })
    ).toContain('Scratch free: 150 B (BELOW OPERATING BUDGET)');
  });
});
