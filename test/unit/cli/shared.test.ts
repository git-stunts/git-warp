import { describe, expect, it, vi } from 'vitest';

import {
  resolveGraphName,
} from '../../../bin/cli/shared.ts';
import type { Persistence } from '../../../bin/cli/types.ts';

describe('CLI Lane resolution', () => {
  it('rejects an explicit Lane that does not exist', async () => {
    const persistence = {
      listRefs: vi.fn().mockResolvedValue([
        'refs/warp/users/writers/alice',
      ]),
    } as unknown as Persistence;

    await expect(resolveGraphName(persistence, 'missing'))
      .rejects.toMatchObject({
        code: 'E_NOT_FOUND',
        message: 'Lane not found: missing',
      });
  });

  it('returns an explicit Lane only after finding its refs', async () => {
    const persistence = {
      listRefs: vi.fn().mockResolvedValue([
        'refs/warp/users/writers/alice',
      ]),
    } as unknown as Persistence;

    await expect(resolveGraphName(persistence, 'users'))
      .resolves.toBe('users');
  });
});
