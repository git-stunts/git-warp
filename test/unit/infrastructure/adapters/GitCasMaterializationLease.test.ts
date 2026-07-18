import type { CacheAcquisition } from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';
import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import type MaterializationHandle from '../../../../src/domain/materialization/MaterializationHandle.ts';
import GitCasMaterializationLease from '../../../../src/infrastructure/adapters/GitCasMaterializationLease.ts';

describe('GitCasMaterializationLease', () => {
  it('does not block a retired borrower behind a concurrent borrower', async () => {
    const release = vi.fn(async () => undefined);
    const lease = createLease(release);
    const first = lease.acquire();
    const concurrent = lease.acquire();
    const retirement = lease.retire();

    await expect(Promise.race([
      first.release().then(() => 'released'),
      new Promise<string>((resolve) => setTimeout(() => resolve('blocked'), 0)),
    ])).resolves.toBe('released');
    expect(release).not.toHaveBeenCalled();

    await concurrent.release();
    await retirement;
    expect(release).toHaveBeenCalledOnce();
  });

  it('releases a borrower-free lease and rejects acquisitions after retirement', async () => {
    const release = vi.fn(async () => undefined);
    const lease = createLease(release);
    const retirement = lease.retire();

    await retirement;
    expect(release).toHaveBeenCalledOnce();
    expect(lease.retire()).toBe(retirement);
    expect(() => lease.acquire()).toThrowError(
      expect.objectContaining({ code: 'E_MATERIALIZATION_STORAGE' }),
    );
  });

  it('propagates an underlying release failure to the final borrower', async () => {
    const failure = new Error('release failed');
    const lease = createLease(vi.fn(async () => {
      throw failure;
    }));
    const borrower = lease.acquire();
    const retirement = lease.retire();

    await expect(borrower.release()).rejects.toBe(failure);
    await expect(retirement).rejects.toBe(failure);
    await expect(borrower.release()).resolves.toBeUndefined();
  });
});

function createLease(release: () => Promise<void>): GitCasMaterializationLease {
  return new GitCasMaterializationLease({
    acquisition: {
      acquiredAt: '2026-07-18T00:00:00.000Z',
      release,
    } as unknown as CacheAcquisition,
    coordinate: new MaterializationCoordinate({ frontier: new Map(), ceiling: null }),
    materialization: {} as MaterializationHandle,
  });
}
