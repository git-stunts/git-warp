import type GitCasMaterializationWorkspace from './GitCasMaterializationWorkspace.ts';
import type { GitCasStagingWorkspace } from './GitCasMaterializationWorkspace.ts';

type WorkspaceOpenRequest = Readonly<{
  open(): Promise<GitCasStagingWorkspace>;
  create(
    workspace: GitCasStagingWorkspace,
    onRelease: () => void,
  ): GitCasMaterializationWorkspace;
}>;

/** Owns materialization workspaces across open/close races. */
export default class GitCasMaterializationWorkspaceOwner {
  readonly #closedError: () => Error;
  readonly #openings = new Set<Promise<GitCasMaterializationWorkspace>>();
  readonly #workspaces = new Set<GitCasMaterializationWorkspace>();
  #closed = false;
  #closePromise: Promise<void> | null = null;

  constructor(closedError: () => Error) {
    this.#closedError = closedError;
  }

  async open(request: WorkspaceOpenRequest): Promise<GitCasMaterializationWorkspace> {
    if (this.#closed) {
      throw this.#closedError();
    }
    const opening = this.#open(request);
    this.#openings.add(opening);
    let workspace: GitCasMaterializationWorkspace;
    try {
      workspace = await opening;
    } finally {
      this.#openings.delete(opening);
    }
    if (this.#closed) {
      const closed = this.#closedError();
      try {
        await workspace.release();
      } catch (releaseError) {
        throw new AggregateError(
          [closed, releaseError],
          'Materialization workspace opened during owner closure and failed to release',
        );
      }
      throw closed;
    }
    return workspace;
  }

  close(): Promise<void> {
    this.#closed = true;
    this.#closePromise ??= this.#close();
    return this.#closePromise;
  }

  async #open(request: WorkspaceOpenRequest): Promise<GitCasMaterializationWorkspace> {
    const staging = await request.open();
    try {
      const workspace = request.create(staging, () => this.#workspaces.delete(workspace));
      this.#workspaces.add(workspace);
      return workspace;
    } catch (error) {
      try {
        await staging.release();
      } catch (releaseError) {
        throw new AggregateError(
          [error, releaseError],
          'Materialization workspace failed to initialize and release',
        );
      }
      throw error;
    }
  }

  async #close(): Promise<void> {
    await Promise.allSettled([...this.#openings]);
    const results = await Promise.allSettled(
      [...this.#workspaces].map(async (workspace) => await workspace.release()),
    );
    this.#workspaces.clear();
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (failures.length === 1) {
      throw failures[0];
    }
    if (failures.length > 1) {
      throw new AggregateError(failures, 'Materialization workspaces failed to close cleanly');
    }
  }
}
