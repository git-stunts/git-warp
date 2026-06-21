import { describe, expect, it } from 'vitest';

import {
  MERGE_CONFLICT_CORPUS,
  summarizeMergeConflictCorpus,
} from '../../fixtures/mergeConflictCorpus.ts';

describe('merge conflict corpus', () => {
  it('keeps a benchmark-sized normalized corpus', () => {
    const summary = summarizeMergeConflictCorpus();

    expect(summary.total).toBeGreaterThanOrEqual(50);
    expect(summary.total).toBeLessThanOrEqual(100);
    expect(summary).toMatchObject({
      projection: 20,
      semantic: 20,
      governance: 20,
      liftedAway: 20,
      requiresPolicy: 40,
    });
    expect(summary.weightedCases).toBe(130);
  });

  it('keeps every case traceable to sources, files, and writers', () => {
    const ids = new Set<string>();

    for (const item of MERGE_CONFLICT_CORPUS) {
      expect(ids.has(item.id)).toBe(false);
      ids.add(item.id);

      expect(item.sourceAnchors.length).toBeGreaterThanOrEqual(2);
      expect(item.filePaths).toHaveLength(2);
      expect(item.writers).toHaveLength(2);
      expect(item.scenario).toContain('Corpus slice:');
      expect(item.liftingStrategy.length).toBeGreaterThan(20);
      expect(item.benchmarkWeight).toBeGreaterThan(0);
    }
  });

  it('separates projection conflicts from conflicts that require policy', () => {
    for (const item of MERGE_CONFLICT_CORPUS) {
      if (item.classification === 'projection') {
        expect(item.liftingRemovesConflict).toBe(true);
      } else {
        expect(item.liftingRemovesConflict).toBe(false);
      }
    }
  });
});
