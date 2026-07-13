/**
 * Storage adapters for public git-warp applications.
 *
 * The package root stays storage-agnostic; applications opt into one of these
 * adapters explicitly.
 */

import GitGraphAdapter, {
  type GitGraphAdapterOptions,
} from './src/infrastructure/adapters/GitGraphAdapter.ts';
import InMemoryGraphAdapter from './src/infrastructure/adapters/InMemoryGraphAdapter.ts';

export type GitStorageAdapterOptions = GitGraphAdapterOptions;

export class GitStorageAdapter extends GitGraphAdapter {
  constructor(options: GitStorageAdapterOptions) {
    super(options);
  }
}

export class MemoryStorageAdapter extends InMemoryGraphAdapter {}
