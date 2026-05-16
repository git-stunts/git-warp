import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('streaming memory audit closeout', () => {
  it('removes the stale v17 streaming-memory audit card', () => {
    expect(existsSync(`${repoRoot}docs/method/backlog/v17.0.0/CORE_streaming-memory-audit.md`)).toBe(false);
  });

  it('ratchets the shipped unbounded blob-read fix', () => {
    const adapter = readRepoFile('src/infrastructure/adapters/GitGraphAdapter.ts');
    const reader = readRepoFile('src/infrastructure/adapters/GitCasGraphReaderAdapter.ts');
    const adapterTest = readRepoFile('test/unit/domain/services/GitGraphAdapter.test.ts');

    expect(adapter).toContain('this._gitCasGraphReader.readBlob');
    expect(reader).toContain('this._persistence.readBlobStream');
    expect(reader).toContain('collectUnboundedGraphBlobStream');
    expect(reader).toContain('byteLength += bytes.byteLength');
    expect(adapterTest).toContain("args: ['cat-file', 'blob', 'abcd']");
  });

  it('keeps broader out-of-core work live outside the v17 crash-fix card', () => {
    const outOfCore = readRepoFile('docs/method/backlog/PERF_out-of-core-materialization.md');
    const streamReadMigration = readRepoFile('docs/method/backlog/up-next/PERF_stream-read-migration.md');
    const releaseLedger = readRepoFile('docs/releases/v17.0.0/README.md');
    const workloads = readRepoFile('docs/method/backlog/WORKLOADS.md');

    expect(outOfCore).toContain('Out-of-core materialization and streaming reads');
    expect(outOfCore).toContain('the full visible graph may not fit in process memory');
    expect(streamReadMigration).toContain('Migrate read paths + unbounded scans to streams');
    expect(releaseLedger).toContain('immediate blob-read cap fix');
    expect(releaseLedger).toContain('closed in cycle 0090');
    expect(releaseLedger).toContain('PERF_out-of-core-materialization');
    expect(workloads).not.toContain('CORE_streaming-memory-audit');
  });
});
