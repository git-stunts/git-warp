import { describe, expect, it } from 'vitest';
import {
  buildConeHeadRef,
  buildConeRetainedRef,
  buildConeStrandBaseRef,
  buildConeStrandHeadRef,
  buildConeStrandPrefix,
} from '../../../../src/domain/utils/ConeRefLayout.ts';
import { RESERVED_GRAPH_NAME_SEGMENTS } from '../../../../src/domain/utils/RefLayout.ts';

const STRAND = 'a'.repeat(64);

describe('ConeRefLayout (#1039)', () => {
  it('builds the clone-local cone basis head and retained refs', () => {
    expect(buildConeHeadRef('events')).toBe('refs/warp/events/cone/head');
    expect(buildConeHeadRef('team/events')).toBe('refs/warp/team/events/cone/head');
    expect(buildConeRetainedRef('events')).toBe('refs/warp/events/cone/retained');
  });

  it('builds the strand base and strand basis refs under one strand prefix', () => {
    expect(buildConeStrandPrefix('events', STRAND)).toBe(`refs/warp/events/cone/strands/${STRAND}/`);
    expect(buildConeStrandBaseRef('events', STRAND)).toBe(`refs/warp/events/cone/strands/${STRAND}/base`);
    expect(buildConeStrandHeadRef('events', STRAND)).toBe(`refs/warp/events/cone/strands/${STRAND}/head`);
  });

  it('reserves the cone segment and rejects invalid graph names and strand ids', () => {
    expect(RESERVED_GRAPH_NAME_SEGMENTS.has('cone')).toBe(true);
    expect(() => buildConeHeadRef('team/cone')).toThrow();
    expect(() => buildConeHeadRef('')).toThrow('cannot be empty');
    expect(() => buildConeRetainedRef('')).toThrow('cannot be empty');
    expect(() => buildConeStrandPrefix('events', 'not-a-strand-id')).toThrow();
  });
});
