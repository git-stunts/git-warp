import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

const MAX_INSPECTED_BLOB_BYTES = 512 * 1024 * 1024;

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

  #containsMachineLocalPath(bytes: Buffer): boolean {
    if (bytes.includes(0)) {
      return false;
    }
    return this.#policy.containsMachineLocalPath(bytes.toString('utf8'));
  }
}
