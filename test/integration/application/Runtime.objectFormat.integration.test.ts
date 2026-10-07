import { describe, expect, it, vi } from 'vitest';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import AdapterValidationError from '../../../src/domain/errors/AdapterValidationError.ts';
import { createGitRepo } from '../../helpers/WarpGraphTestRepositories.ts';

const REF = 'refs/warp/cas-fixture/value';
const CASE_TIMEOUT_MS = 60_000;

// Real Git oracle: exact ref state, not an assumed null-sentinel byte width.
describe.each(['sha1', 'sha256'])('ref CAS in %s repositories', (format) => {
  async function repository() {
    if (format !== 'sha1' && format !== 'sha256') { throw new Error('Unsupported object format'); }
    return await createGitRepo('ref-cas', { objectFormat: format });
  }

  it('creates, replaces, refuses stale expectations, and deletes only the expected ref', async () => {
    const repo = await repository();
    try {
      const first = await repo.persistence.writeBlob('first');
      const second = await repo.persistence.writeBlob('second');
      await repo.persistence.compareAndSwapRef(REF, first, null);
      expect(await repo.persistence.readRef(REF)).toBe(first);
      const execute = vi.spyOn(repo.plumbing, 'execute');
      await expect(repo.persistence.compareAndSwapRef(REF, second, null))
        .rejects.toMatchObject({ name: 'GitRepositoryLockedError', details: { code: 'GIT_REPOSITORY_LOCKED' } });
      expect(execute.mock.calls.filter(([request]) => request.args[0] === 'update-ref')).toHaveLength(1);
      expect(await repo.persistence.readRef(REF)).toBe(first);
      await repo.persistence.compareAndSwapRef(REF, second, first);
      await expect(repo.persistence.compareAndSwapRef(REF, first, first))
        .rejects.toMatchObject({ name: 'GitRepositoryLockedError', details: { code: 'GIT_REPOSITORY_LOCKED' } });
      expect(await repo.persistence.readRef(REF)).toBe(second);
      expect(await repo.persistence.compareAndDeleteRef(REF, first)).toBe(false);
      expect(await repo.persistence.readRef(REF)).toBe(second);
      expect(await repo.persistence.compareAndDeleteRef(REF, second)).toBe(true);
      expect(await repo.persistence.readRef(REF)).toBeNull();
      execute.mockRestore();
    } finally { await repo.cleanup(); }
  }, CASE_TIMEOUT_MS);

  it('admits exactly one competing absent-ref creation', async () => {
    const repo = await repository();
    try {
      const first = await repo.persistence.writeBlob('first contender');
      const second = await repo.persistence.writeBlob('second contender');
      const outcomes = await Promise.allSettled([
        repo.persistence.compareAndSwapRef(REF, first, null),
        repo.persistence.compareAndSwapRef(REF, second, null),
      ]);
      expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1);
      const winner = outcomes[0]?.status === 'fulfilled' ? first : second;
      expect(await repo.persistence.readRef(REF)).toBe(winner);
    } finally { await repo.cleanup(); }
  }, CASE_TIMEOUT_MS);

  it('supports an abbreviated target without inferring repository width from its spelling', async () => {
    const repo = await repository();
    try {
      const target = await repo.persistence.writeBlob('abbreviated target');
      await repo.persistence.compareAndSwapRef(REF, target.slice(0, 12), null);
      expect(await repo.persistence.readRef(REF)).toBe(target);
    } finally { await repo.cleanup(); }
  }, CASE_TIMEOUT_MS);

  it('refuses malformed and wrong-format objects without changing the ref', async () => {
    const repo = await repository();
    try {
      await expect(repo.persistence.compareAndSwapRef(REF, 'bad!', null))
        .rejects.toBeInstanceOf(AdapterValidationError);
      const wrongWidth = format === 'sha1' ? 64 : 40;
      await expect(repo.persistence.compareAndSwapRef(REF, 'a'.repeat(wrongWidth), null))
        .rejects.toMatchObject({ name: 'GitPlumbingError', details: { code: 128 } });
      expect(await repo.persistence.readRef(REF)).toBeNull();
    } finally { await repo.cleanup(); }
  }, CASE_TIMEOUT_MS);

  it('opens a fresh public Lane, publishes a marker, and admits writes across reopen', async () => {
    const repo = await repository();
    try {
      const runtime = await Runtime.open({ at: repo.tempDir, writer: 'writer' });
      try {
        const lane = await runtime.lane('L');
        expect((await lane.write(intent.node.add({ subject: 'n' }))).outcome.kind).toBe('derived');
        expect(await repo.persistence.readRef('refs/warp/L/substrate-version')).not.toBeNull();
      } finally { await runtime.close(); }
      const reopened = await Runtime.open({ at: repo.tempDir, writer: 'writer' });
      try {
        const lane = await reopened.lane('L');
        expect((await lane.write(intent.property.set({ subject: 'n', key: 'v', value: 'ok' }))).outcome.kind).toBe('derived');
        expect(await repo.persistence.readRef('refs/warp/L/writers/writer')).not.toBeNull();
      } finally { await reopened.close(); }
    } finally { await repo.cleanup(); }
  }, CASE_TIMEOUT_MS);
});
