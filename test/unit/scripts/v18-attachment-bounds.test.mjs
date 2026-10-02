import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import ContentAddressableStore from '@git-stunts/git-cas';
import { runV18MigrationGit, v18MigrationGitText } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';
import { V18MigrationGitObjectReader } from '../../../scripts/v18-to-v19/V18MigrationGitObjectReader.ts';
import V18PatchTranslator from '../../../scripts/v18-to-v19/V18PatchTranslator.ts';

const LIMIT = 64 * 1024 * 1024;

describe('legacy migration attachment bounds', () => {
  it('refuses oversized Git stdout and batch objects without losing batch synchronization', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'migration-bounds-'));
    try {
      await v18MigrationGitText(cwd, ['init', '--bare']);
      const oid = await v18MigrationGitText(cwd, ['hash-object', '-w', '--stdin'], { input: new Uint8Array(LIMIT + 1) });
      const small = await v18MigrationGitText(cwd, ['hash-object', '-w', '--stdin'], { input: 'next' });
      const refusal = await runV18MigrationGit(cwd, ['cat-file', 'blob', oid])
        .then(() => null, (error) => error.code);
      const reader = new V18MigrationGitObjectReader(cwd);
      try {
        const batchRefusal = await reader.readObject(oid, 'blob').then(() => null, (error) => error.message);
        expect({ refusal, batchRefusal }).toEqual({ refusal: 'E_BYTE_COLLECTION_LIMIT', batchRefusal: expect.stringContaining('exceeds migration byte limit') });
        expect(Buffer.from(await reader.readObject(small, 'blob')).toString()).toBe('next');
      } finally { await reader.close(); }
    } finally { await rm(cwd, { recursive: true, force: true }); }
  }, 30_000);

  it('bounds adopted patch-tree decoding and closes its source on overflow', async () => {
    let finalized = false;
    const part = new Uint8Array(LIMIT / 2 + 1);
    async function* source() { try { yield part; yield part; } finally { finalized = true; } }
    const open = vi.spyOn(ContentAddressableStore, 'open').mockResolvedValue({
      assets: { adopt: async () => ({ handle: 'adopted' }), open: () => source() },
      close: async () => undefined,
    });
    try {
      const translator = await V18PatchTranslator.open({ objectReader: {}, repositoryPath: '.' });
      try {
        await expect(translator.translate({ storage: { kind: 'v18-git-cas', encrypted: false, oid: 'fixture' }, commit: { sha: 'fixture' } }))
          .rejects.toMatchObject({ code: 'E_BYTE_COLLECTION_LIMIT' });
        expect(finalized).toBe(true);
      } finally { await translator.close(); }
    } finally { open.mockRestore(); }
  });
});
