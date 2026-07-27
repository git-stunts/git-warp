import { describe, expect, it } from 'vitest';
import {
  checkMaterializationCache,
} from '../../../bin/cli/commands/doctor/checksMaterializationCache.ts';
import { CODES } from '../../../bin/cli/commands/doctor/codes.ts';
import type {
  MaterializationCacheEntryDiagnostic,
  MaterializationCacheInspection,
} from '../../../src/ports/MaterializationCacheDiagnosticsPort.ts';

function entry(
  key: string,
  status: MaterializationCacheEntryDiagnostic['status'],
  patchSha = 'current',
): MaterializationCacheEntryDiagnostic {
  return Object.freeze({
    key,
    handle: `bundle:${key}`,
    status,
    retention: 'evictable',
    expiresAt: status === 'expired' ? '2026-07-01T00:00:00.000Z' : null,
    createdAt: '2026-07-01T00:00:00.000Z',
    accessedAt: '2026-07-02T00:00:00.000Z',
    logicalBytes: 42,
    collectible: true,
    coordinate: status === 'live'
      ? { ceiling: null, frontier: [{ writerId: 'alice', patchSha }] }
      : null,
    stateHash: status === 'live' ? `state-${key}` : null,
    issue: status === 'missing' || status === 'malformed'
      ? { code: `TEST_${status.toUpperCase()}`, message: status }
      : null,
  });
}

function inspection(options: {
  healthy?: boolean;
  entries?: ReadonlyArray<MaterializationCacheEntryDiagnostic>;
  issues?: ReadonlyArray<{ code: string; message: string | null }>;
} = {}): MaterializationCacheInspection {
  return Object.freeze({
    namespace: 'git-warp/materializations',
    ref: 'refs/cas/caches/git-warp/materializations',
    generation: 'generation-1',
    healthy: options.healthy ?? true,
    entries: options.entries ?? [],
    issues: options.issues ?? [],
    policy: null,
  });
}

function contextWithInspection(value: MaterializationCacheInspection) {
  return {
    materializationCacheDiagnostics: {
      inspectCache: async () => value,
    },
    writerHeads: [{ writerId: 'alice', sha: 'current' }],
  };
}

describe('materialization-cache doctor check', () => {
  it('reports live, stale, and collectible WARP coordinate evidence', async () => {
    const findings = await checkMaterializationCache(
      contextWithInspection(inspection({
        entries: [
          entry('current', 'live'),
          entry('stale', 'live', 'old'),
        ],
      })),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        status: 'ok',
        code: CODES.MATERIALIZATION_CACHE_OK,
        message: expect.stringContaining('1 stale coordinate'),
        evidence: expect.objectContaining({
          liveEntries: expect.arrayContaining([
            expect.objectContaining({ key: 'current' }),
            expect.objectContaining({ key: 'stale' }),
          ]),
          staleEntries: [expect.objectContaining({ key: 'stale' })],
          collectibleEntries: expect.arrayContaining([
            expect.objectContaining({ key: 'current' }),
            expect.objectContaining({ key: 'stale' }),
          ]),
        }),
      }),
    ]);
  });

  it('separates structural, missing, malformed, and expired failures', async () => {
    const findings = await checkMaterializationCache(contextWithInspection(inspection({
      healthy: false,
      entries: [
        entry('missing', 'missing'),
        entry('malformed', 'malformed'),
        entry('expired', 'expired'),
      ],
      issues: [{ code: 'CACHE_ROOT_INVALID', message: 'malformed metadata' }],
    })));
    const codes = findings.map((finding) => finding.code);

    expect(codes).toEqual([
      CODES.MATERIALIZATION_CACHE_INVALID,
      CODES.MATERIALIZATION_CACHE_ENTRY_MISSING,
      CODES.MATERIALIZATION_CACHE_ENTRY_MALFORMED,
      CODES.MATERIALIZATION_CACHE_ENTRY_EXPIRED,
    ]);
  });

  it('fails closed when git-cas reports unhealthy without issue details', async () => {
    const findings = await checkMaterializationCache(
      contextWithInspection(inspection({ healthy: false })),
    );

    expect(findings).toEqual([
      expect.objectContaining({
        status: 'fail',
        code: CODES.MATERIALIZATION_CACHE_INVALID,
        message: 'git-cas reported the materialization cache as unhealthy',
      }),
    ]);
  });

});
