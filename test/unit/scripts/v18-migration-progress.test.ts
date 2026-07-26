import { describe, expect, it } from 'vitest';

import { shouldReportV18CommitProgress } from '../../../scripts/v18-to-v19/V18MigrationProgress.ts';

describe('v18 migration progress', () => {
  it('reports every 250 commits and at writer completion', () => {
    expect(shouldReportV18CommitProgress(249, 501)).toBe(false);
    expect(shouldReportV18CommitProgress(250, 501)).toBe(true);
    expect(shouldReportV18CommitProgress(251, 501)).toBe(false);
    expect(shouldReportV18CommitProgress(500, 501)).toBe(true);
    expect(shouldReportV18CommitProgress(501, 501)).toBe(true);
  });
});
