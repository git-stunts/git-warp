import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../src/domain/utils/RefLayout.ts', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../../../../../src/domain/utils/RefLayout.ts')
  >();
  return {
    ...actual,
    validateGraphName: vi.fn(actual.validateGraphName),
    validateWriterId: vi.fn(actual.validateWriterId),
  };
});

import ForkError from '../../../../../src/domain/errors/ForkError.ts';
import {
  validateGraphName,
  validateWriterId,
} from '../../../../../src/domain/utils/RefLayout.ts';
import InMemoryGraphAdapter from '../../../../helpers/InMemoryGraphAdapter.ts';
import { openMemoryRuntimeHostProduct } from '../../../../helpers/MemoryRuntimeHost.ts';

describe('ForkController identity validation', () => {
  it('returns a typed error for an invalid fork writer ID', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'fork-validation',
      writerId: 'writer-1',
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });
    const originalError = "Invalid writer ID: contains path traversal sequence '..': ../invalid";

    await expect(runtime.fork({
      from: 'writer-1',
      at,
      forkName: 'valid-fork-name',
      forkWriterId: '../invalid',
    })).rejects.toMatchObject({
      name: ForkError.name,
      code: 'E_FORK_WRITER_ID_INVALID',
      message: `Invalid fork writer ID: ${originalError}`,
      context: { forkWriterId: '../invalid', originalError },
    });
  });

  it('preserves validator detail for an invalid fork name', async () => {
    const persistence = new InMemoryGraphAdapter();
    const runtime = await openMemoryRuntimeHostProduct({
      persistence,
      graphName: 'fork-validation',
      writerId: 'writer-1',
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });
    const originalError = "Invalid graph name: contains path traversal sequence '..': ../invalid";

    await expect(runtime.fork({
      from: 'writer-1',
      at,
      forkName: '../invalid',
      forkWriterId: 'writer-2',
    })).rejects.toMatchObject({
      name: ForkError.name,
      code: 'E_FORK_NAME_INVALID',
      message: `Invalid fork name: ${originalError}`,
      context: { forkName: '../invalid', originalError },
    });
  });

  it('rethrows a non-Error fork-name validation failure unchanged', async () => {
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'fork-validation',
      writerId: 'writer-1',
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });
    const failure = 'non-error graph-name failure';
    vi.mocked(validateGraphName)
      .mockImplementationOnce(() => {
        throw failure;
      });

    await expect(runtime.fork({
      from: 'writer-1',
      at,
      forkName: 'valid-fork-name',
      forkWriterId: 'writer-2',
    })).rejects.toBe(failure);
  });

  it('rethrows a non-Error writer-ID validation failure unchanged', async () => {
    const runtime = await openMemoryRuntimeHostProduct({
      persistence: new InMemoryGraphAdapter(),
      graphName: 'fork-validation',
      writerId: 'writer-1',
    });
    const at = await runtime.patch((patch) => {
      patch.addNode('node:base');
    });
    const failure = 'non-error writer-ID failure';
    vi.mocked(validateWriterId)
      .mockImplementationOnce(() => {
        throw failure;
      });

    await expect(runtime.fork({
      from: 'writer-1',
      at,
      forkName: 'valid-fork-name',
      forkWriterId: 'writer-2',
    })).rejects.toBe(failure);
  });
});
