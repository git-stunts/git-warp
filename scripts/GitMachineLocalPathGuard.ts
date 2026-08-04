import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

const MAX_INSPECTED_BLOB_BYTES = 512 * 1024 * 1024;
const OBJECT_ID_PATTERN = /^[0-9a-f]{40,64}$/u;
const ZERO_OBJECT_PATTERN = /^0+$/u;

export class GitMachineLocalPathGuard {
  readonly #repository: string;
  readonly #policy: MachineLocalPathPolicy;

  constructor(repository: string, policy: MachineLocalPathPolicy) {
    this.#repository = repository;
    this.#policy = policy;
  }

  findWorkingTreePaths(): string[] {
    const inventory = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: this.#repository, encoding: 'utf8' }
    );
    const paths = inventory.split('\0').filter((path) => path.length > 0);

    return paths.filter((path) => {
      const absolutePath = join(this.#repository, path);
      if (!existsSync(absolutePath)) {
        return false;
      }
      const metadata = lstatSync(absolutePath);
      if (metadata.isSymbolicLink()) {
        return this.#policy.containsMachineLocalPath(readlinkSync(absolutePath, 'utf8'));
      }
      return this.#containsMachineLocalPath(readFileSync(absolutePath));
    });
  }

  findStagedPaths(): string[] {
    const inventory = execFileSync(
      'git',
      ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z'],
      {
        cwd: this.#repository,
        encoding: 'utf8',
      }
    );
    const paths = inventory.split('\0').filter((path) => path.length > 0);

    return paths.filter((path) => {
      const bytes = execFileSync('git', ['cat-file', 'blob', `:${path}`], {
        cwd: this.#repository,
        maxBuffer: MAX_INSPECTED_BLOB_BYTES,
      });
      return this.#containsMachineLocalPath(bytes);
    });
  }

  findOutgoingObjects(pushUpdates: string, remoteName: string): string[] {
    const outgoingObjectIds = new Set<string>();
    const remoteTips = this.#findRemoteTips(remoteName);

    for (const line of pushUpdates.split('\n')) {
      if (line.trim().length === 0) {
        continue;
      }
      const fields = line.trim().split(/\s+/u);
      const localObject = fields[1];
      const remoteObject = fields[3];
      if (fields.length !== 4 || localObject === undefined || remoteObject === undefined) {
        throw new Error('Malformed pre-push update');
      }
      if (!OBJECT_ID_PATTERN.test(localObject) || !OBJECT_ID_PATTERN.test(remoteObject)) {
        throw new Error('Malformed pre-push object id');
      }
      if (ZERO_OBJECT_PATTERN.test(localObject)) {
        continue;
      }

      const exclusions = ZERO_OBJECT_PATTERN.test(remoteObject) ? remoteTips : [remoteObject];
      const revisionArguments = [localObject, ...exclusions.map((objectId) => `^${objectId}`)];
      const inventory = execFileSync(
        'git',
        ['rev-list', '--objects', '--no-object-names', ...revisionArguments],
        { cwd: this.#repository, encoding: 'utf8' }
      );
      for (const objectId of inventory.split('\n')) {
        if (objectId.length === 0) {
          continue;
        }
        if (!OBJECT_ID_PATTERN.test(objectId)) {
          throw new Error('Git returned a malformed outgoing object id');
        }
        outgoingObjectIds.add(objectId);
      }
    }

    const offenders: string[] = [];
    for (const objectId of outgoingObjectIds) {
      const objectType = execFileSync('git', ['cat-file', '-t', objectId], {
        cwd: this.#repository,
        encoding: 'utf8',
      }).trim();
      if (objectType === 'tree') {
        continue;
      }
      if (objectType !== 'blob' && objectType !== 'commit' && objectType !== 'tag') {
        throw new Error(`Unsupported outgoing Git object type: ${objectType}`);
      }
      const bytes = execFileSync('git', ['cat-file', objectType, objectId], {
        cwd: this.#repository,
        maxBuffer: MAX_INSPECTED_BLOB_BYTES,
      });
      if (this.#containsMachineLocalPath(bytes)) {
        offenders.push(`${objectType}:${objectId}`);
      }
    }

    return offenders.sort();
  }

  #findRemoteTips(remoteName: string): string[] {
    if (remoteName.length === 0) {
      return [];
    }
    const tips = execFileSync(
      'git',
      ['for-each-ref', '--format=%(objectname)', `refs/remotes/${remoteName}/`],
      { cwd: this.#repository, encoding: 'utf8' }
    );
    return tips
      .split('\n')
      .filter((objectId) => objectId.length > 0)
      .map((objectId) => {
        if (!OBJECT_ID_PATTERN.test(objectId)) {
          throw new Error('Git returned a malformed remote object id');
        }
        return objectId;
      });
  }

  #containsMachineLocalPath(bytes: Buffer): boolean {
    return this.#policy.containsMachineLocalPath(bytes.toString('utf8'));
  }
}
