import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

const PIPELINE_FILES: readonly string[] = [
  'src/domain/services/strand/ConflictFrameLoader.ts',
  'src/domain/services/strand/ConflictCandidateCollector.ts',
  'src/domain/services/strand/conflictCandidateAnalysis.ts',
  'src/domain/services/strand/conflictTargetIdentity.ts',
  'src/domain/services/strand/ConflictTraceAssembler.ts',
];

function repoPath(relativePath: string): URL {
  return new URL(relativePath, REPO_ROOT);
}

async function readSource(relativePath: string): Promise<string> {
  return await readFile(repoPath(relativePath), 'utf8');
}

describe('conflict pipeline context boundary', () => {
  it('routes analyzer work through ConflictPipelineContext instead of the analyzer instance', async () => {
    const source = await readSource('src/domain/services/strand/ConflictAnalyzerService.ts');

    expect(source).toContain('new ConflictPipelineContext');
    expect(source).toContain('resolveAnalysisContext(context');
    expect(source).toContain('ConflictCandidateCollector.collect(context');
    expect(source).toContain('buildConflictTraces(context');
    expect(source).toContain('buildAnalysisSnapshotHash(context');
    expect(source).toContain('buildEmptySnapshotHash(context');
    expect(source).not.toContain('resolveAnalysisContext(this');
    expect(source).not.toContain('ConflictCandidateCollector.collect(this');
    expect(source).not.toContain('buildConflictTraces(this');
    expect(source).not.toContain('buildAnalysisSnapshotHash(this');
    expect(source).not.toContain('buildEmptySnapshotHash(this');
  });

  it('keeps pipeline modules on the explicit context dependency', async () => {
    for (const relativePath of PIPELINE_FILES) {
      const source = await readSource(relativePath);

      expect(source).toContain('ConflictPipelineContext');
      expect(source).not.toContain('type AnalyzerService');
      expect(source).not.toContain('interface HashingService');
      expect(source).not.toContain('type HashingService');
      expect(source).not.toContain('service._graph');
      expect(source).not.toContain('service._hash');
    }
  });
});
