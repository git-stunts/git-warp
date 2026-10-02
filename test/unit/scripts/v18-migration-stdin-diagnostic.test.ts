import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { runV18MigrationGit } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';

it('preserves a broken stdin diagnostic even when the command exits successfully', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'migration-stdin-'));
  try {
    await writeFile(join(directory, 'git'), '#!/bin/sh\nexec 0<&-\nexit 0\n', { mode: 0o755 });
    await expect(runV18MigrationGit(directory, [], {
      env: { PATH: directory },
      input: new Uint8Array(1024 * 1024),
    })).rejects.toMatchObject({ exitCode: 0, stderr: expect.stringContaining('stdin:') });
  } finally {
    await rm(directory, { recursive: true });
  }
});
