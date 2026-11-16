import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('packed-artifact result command', () => {
  let directory: string;
  const originalArguments = process.argv;
  const originalExitCode = process.exitCode;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'warp-packed-results-'));
    await Promise.all([
      writeFile(join(directory, 'write.json'), '{"outcome":{"kind":"derived"}}'),
      writeFile(join(directory, 'observe.json'), '{"readings":[{"value":"admin","reducerVersion":"observed-remove/node-lww-clear"}],"receipt":{"reducerVersion":"observed-remove/node-lww-clear"}}'),
      writeFile(join(directory, 'doctor-before.json'), '{"findings":[{"id":"hooks-installed","code":"HOOKS_MISSING","status":"warn"}]}'),
      writeFile(join(directory, 'doctor-after.json'), '{"findings":[{"id":"hooks-installed","code":"HOOKS_OK","status":"ok"}]}'),
      writeFile(join(directory, 'upgrade.json'), '{"dryRun":true,"graphs":[{"graphName":"events","checkpoint":{"status":"already-current"}}]}'),
    ]);
    process.argv = [process.execPath, 'CheckPackedArtifact.ts', 'results', directory];
    process.exitCode = 0;
    vi.resetModules();
  });

  afterEach(async () => {
    process.argv = originalArguments;
    process.exitCode = originalExitCode;
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts a derived Warp write with matching observation and maintenance results', async () => {
    await import('../../../scripts/package-payload/CheckPackedArtifact.ts');
    expect(process.exitCode).toBe(0);
  });

  it.each([
    '{"outcome":{"kind":"unpublished"}}',
    '{"lane":"events","intent":{"kind":"property.set"}}',
  ])('refuses a write that does not prove derivation: %s', async (write) => {
    await writeFile(join(directory, 'write.json'), write);
    await import('../../../scripts/package-payload/CheckPackedArtifact.ts');
    expect(process.exitCode).toBe(1);
  });

  it('refuses a reading that does not contain the written value', async () => {
    await writeFile(join(directory, 'observe.json'), '{"readings":[{"value":"guest","reducerVersion":"observed-remove/node-lww-clear"}],"receipt":{"reducerVersion":"observed-remove/node-lww-clear"}}');
    await import('../../../scripts/package-payload/CheckPackedArtifact.ts');
    expect(process.exitCode).toBe(1);
  });
});
