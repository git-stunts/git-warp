import { execFileSync } from 'node:child_process';

/**
 * Moves writer chains between clones through a shared Git remote, exactly as
 * docs/topics/sync.md prescribes: publish only the chain this clone owns plus
 * the Lane's substrate marker; receive every other writer's chain without
 * pruning, without `+`, after checking the marker.
 *
 * Nothing derived travels. Each clone's cone basis (`refs/warp/<lane>/cone/head`)
 * is local and folds the received patches forward on its next read or write,
 * so there is no rebuild step after receiving.
 */

class HubSyncRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HubSyncRefusal';
  }
}

export type SyncTarget = Readonly<{ repository: string; lane: string; writer: string; remote: string }>;

function git(repository: string, args: readonly string[]): string {
  return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function optionalGit(repository: string, args: readonly string[]): string {
  try {
    return git(repository, args);
  } catch {
    return '';
  }
}

/** `git push --atomic` of this writer's chain and the substrate marker, fast-forward only. */
export function publish(target: SyncTarget): void {
  const chain = `refs/warp/${target.lane}/writers/${target.writer}`;
  const marker = `refs/warp/${target.lane}/substrate-version`;
  git(target.repository, ['push', '--quiet', '--atomic', target.remote, `${chain}:${chain}`, `${marker}:${marker}`]);
}

/** Marker check, then a no-prune fetch of every other writer's chain. */
export function receive(target: SyncTarget): void {
  const marker = `refs/warp/${target.lane}/substrate-version`;
  const hubMarker = optionalGit(target.repository, ['ls-remote', target.remote, marker]).split('\t')[0] ?? '';
  const localMarker = optionalGit(target.repository, ['rev-parse', '-q', '--verify', marker]);
  if (hubMarker === '' || (localMarker !== '' && hubMarker !== localMarker)) {
    throw new HubSyncRefusal("The hub's substrate marker is missing or differs; migrate the hub first.");
  }
  git(target.repository, [
    'fetch', '--quiet', '--no-prune', '--no-tags', target.remote,
    `${marker}:${marker}`,
    `refs/warp/${target.lane}/writers/*:refs/warp/${target.lane}/writers/*`,
    `^refs/warp/${target.lane}/writers/${target.writer}`,
  ]);
}
