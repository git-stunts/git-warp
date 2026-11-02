import { describe, expect, it } from 'vitest';
import {
  buildAllocationFloorRef, buildAuditPrefix, buildDotRepairRef, buildIntentRef, buildStateCacheRef,
  buildStrandBraidRef, buildStrandRef, buildStrandWriterRef, buildSubstrateVersionRef,
  buildTrustRecordRef, buildWorldlineMigrationRecordRef,
} from '../../../../src/domain/utils/RefLayout.ts';

const STRAND = 'a'.repeat(64);
const SUPPORT = 'b'.repeat(64);
const REPAIR = 'c'.repeat(64);

describe('graph ref namespaces', () => {
  const cases = [
    { build: buildAuditPrefix, suffix: 'audit/' },
    { build: buildStateCacheRef, suffix: 'state-cache' },
    { build: buildSubstrateVersionRef, suffix: 'substrate-version' },
    { build: buildTrustRecordRef, suffix: 'trust/records' },
    { build: buildWorldlineMigrationRecordRef, suffix: 'migrations/worldline' },
    { build: (graph: string) => buildAllocationFloorRef(graph, 'alice'), suffix: 'allocation/alice' },
    { build: (graph: string) => buildIntentRef(graph, 'admitted', 'alice'), suffix: 'intents/admitted/alice' },
    { build: (graph: string) => buildIntentRef(graph, 'queued', 'alice'), suffix: 'intents/queued/alice' },
    { build: (graph: string) => buildStrandRef(graph, STRAND), suffix: `strands/${STRAND}/descriptor` },
    { build: (graph: string) => buildStrandWriterRef(graph, STRAND, 'alice'), suffix: `strands/${STRAND}/writers/alice` },
    { build: (graph: string) => buildStrandBraidRef(graph, STRAND, { braidedStrandId: SUPPORT, writerId: 'alice' }), suffix: `strands/${STRAND}/braids/${SUPPORT}/alice` },
    { build: (graph: string) => buildDotRepairRef(graph, REPAIR), suffix: `repairs/${REPAIR}` },
  ];

  it.each(cases)('keeps $suffix in its namespace under a nested graph', ({ build, suffix }) => {
    expect(build('org/events')).toBe(`refs/warp/org/events/${suffix}`);
  });

  it.each(cases)('refuses the reserved cone graph segment for $suffix', ({ build }) => {
    expect(() => build('org/cone/events')).toThrow('reserved ref-layout keyword');
  });

  it('refuses malformed repair and strand identities before producing refs', () => {
    expect(() => buildDotRepairRef('events', 'not-a-digest')).toThrowError(expect.objectContaining({ code: 'E_DOT_REPAIR_INVALID' }));
    expect(() => buildStrandRef('events', 'friendly-name')).toThrow();
  });
});
