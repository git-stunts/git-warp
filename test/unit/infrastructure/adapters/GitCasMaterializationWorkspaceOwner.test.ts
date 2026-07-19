import { describe, expect, it, vi } from 'vitest';
import GitCasMaterializationWorkspace, {
  type GitCasStagingWorkspace,
} from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import GitCasMaterializationWorkspaceOwner from '../../../../src/infrastructure/adapters/GitCasMaterializationWorkspaceOwner.ts';

describe('GitCasMaterializationWorkspaceOwner', () => {
  it('rejects workspace opens after closure', async () => {
    const closed = new Error('owner closed');
    const owner = new GitCasMaterializationWorkspaceOwner(() => closed);
    await owner.close();

    await expect(owner.open(openRequest(vi.fn()))).rejects.toBe(closed);
  });

  it('preserves a release failure when an open races with closure', async () => {
    const closed = new Error('owner closed');
    const releaseFailure = new Error('release failed');
    const owner = new GitCasMaterializationWorkspaceOwner(() => closed);
    const staging = Promise.withResolvers<GitCasStagingWorkspace>();
    const opening = owner.open({
      open: async () => await staging.promise,
      create: createWorkspace,
    });
    const closing = owner.close();
    staging.resolve(stagingWorkspace(vi.fn().mockRejectedValue(releaseFailure)));

    const [openResult, closeResult] = await Promise.allSettled([opening, closing]);

    expect(openResult).toMatchObject({
      status: 'rejected',
      reason: { errors: [closed, releaseFailure] },
    });
    expect(closeResult).toEqual({ status: 'rejected', reason: releaseFailure });
  });

  it('aggregates failures while releasing multiple active workspaces', async () => {
    const firstFailure = new Error('first release failed');
    const secondFailure = new Error('second release failed');
    const owner = new GitCasMaterializationWorkspaceOwner(() => new Error('owner closed'));
    await owner.open(openRequest(vi.fn().mockRejectedValue(firstFailure)));
    await owner.open(openRequest(vi.fn().mockRejectedValue(secondFailure)));

    await expect(owner.close()).rejects.toMatchObject({
      errors: [firstFailure, secondFailure],
    });
  });

  it('releases the staging workspace when wrapper creation fails', async () => {
    const creationFailure = new Error('workspace creation failed');
    const release = vi.fn().mockResolvedValue(undefined);
    const owner = new GitCasMaterializationWorkspaceOwner(() => new Error('owner closed'));

    await expect(owner.open({
      open: async () => stagingWorkspace(release),
      create: () => {
        throw creationFailure;
      },
    })).rejects.toBe(creationFailure);

    expect(release).toHaveBeenCalledOnce();
  });

  it('preserves creation and release failures when wrapper creation fails', async () => {
    const creationFailure = new Error('workspace creation failed');
    const releaseFailure = new Error('release failed');
    const owner = new GitCasMaterializationWorkspaceOwner(() => new Error('owner closed'));

    await expect(owner.open({
      open: async () => stagingWorkspace(vi.fn().mockRejectedValue(releaseFailure)),
      create: () => {
        throw creationFailure;
      },
    })).rejects.toMatchObject({
      errors: [creationFailure, releaseFailure],
    });
  });
});

function openRequest(release: () => Promise<void>) {
  return {
    open: async (): Promise<GitCasStagingWorkspace> => stagingWorkspace(release),
    create: createWorkspace,
  };
}

function createWorkspace(
  workspace: GitCasStagingWorkspace,
  onRelease: () => void,
): GitCasMaterializationWorkspace {
  return new GitCasMaterializationWorkspace({
    workspace,
    promote: async () => {
      throw new Error('promotion is outside this ownership test');
    },
    onRelease,
  });
}

function stagingWorkspace(release: () => Promise<void>): GitCasStagingWorkspace {
  return {
    pages: { put: vi.fn() },
    bundles: { putOrdered: vi.fn() },
    checkpoint: vi.fn(),
    promoteToCache: vi.fn(),
    release,
  } as unknown as GitCasStagingWorkspace;
}
