import { describe, expect, it } from 'vitest';
import { releaseWorkspaceAfterFailure } from '../../../../../src/domain/services/controllers/MaterializationWorkspaceCleanup.ts';
import MaterializationWorkspacePort from '../../../../../src/ports/MaterializationWorkspacePort.ts';
import { createMockLogger } from '../../../../helpers/WarpGraphMockLogger.ts';

describe('releaseWorkspaceAfterFailure', () => {
  it('contains logger failures while reporting cleanup errors', async () => {
    const logger = createMockLogger();
    logger.warn.mockImplementation(() => {
      throw new Error('logger unavailable');
    });

    await expect(releaseWorkspaceAfterFailure(
      new RejectingWorkspace(new Error('release unavailable')),
      logger,
    )).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledOnce();
  });

  it('contains cleanup failures that cannot be rendered', async () => {
    const logger = createMockLogger();
    const cleanupFailure = {
      toString(): never {
        throw new Error('cleanup failure cannot be rendered');
      },
    };

    await expect(releaseWorkspaceAfterFailure(
      new RejectingWorkspace(cleanupFailure),
      logger,
    )).resolves.toBeUndefined();
    expect(logger.warn).not.toHaveBeenCalled();
  });
});

class RejectingWorkspace extends MaterializationWorkspacePort {
  readonly #failure: Error | { readonly toString: () => never };

  constructor(failure: Error | { readonly toString: () => never }) {
    super();
    this.#failure = failure;
  }

  override checkpoint(): Promise<null> {
    return Promise.resolve(null);
  }

  override promote(): Promise<never> {
    return Promise.reject(new Error('promotion is not used by this test'));
  }

  override release(): Promise<never> {
    return Promise.reject(this.#failure);
  }
}
