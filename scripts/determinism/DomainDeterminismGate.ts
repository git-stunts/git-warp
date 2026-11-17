// SPDX-License-Identifier: Apache-2.0

import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import type { DeterminismBan } from './DeterminismBan.ts';
import { DeterminismScan } from './DeterminismScan.ts';
import { DeterminismScanRefusal } from './DeterminismScanRefusal.ts';
import { DeterminismViolation } from './DeterminismViolation.ts';
import { listDomainFiles } from './listDomainFiles.ts';

/** The one directory the gate scans (docs/ANTI_SLUDGE_POLICY.md section 9). */
export const DOMAIN_DIRECTORY = 'src/domain';

/** Scans every file under `<root>/src/domain` for the given bans. */
export class DomainDeterminismGate {
  readonly root: string;
  readonly bans: readonly DeterminismBan[];

  constructor(root: string, bans: readonly DeterminismBan[]) {
    if (bans.length === 0) {
      throw new RangeError('A determinism gate needs at least one ban');
    }
    this.root = root;
    this.bans = Object.freeze([...bans]);
    Object.freeze(this);
  }

  scan(): DeterminismScan | DeterminismScanRefusal {
    if (statSync(join(this.root, DOMAIN_DIRECTORY), { throwIfNoEntry: false })?.isDirectory() !== true) {
      return new DeterminismScanRefusal(`${DOMAIN_DIRECTORY} is not a directory`);
    }
    const files = listDomainFiles(this.root, DOMAIN_DIRECTORY);
    if (files instanceof DeterminismScanRefusal) {
      return files;
    }
    if (files.length === 0) {
      return new DeterminismScanRefusal(`${DOMAIN_DIRECTORY} scanned no files`);
    }
    return new DeterminismScan(files.length, files.flatMap((path) => this.violationsIn(path)));
  }

  private violationsIn(path: string): DeterminismViolation[] {
    const lines = readFileSync(join(this.root, path), 'utf8').split(/\r?\n/);
    return lines.flatMap((lineText, index) => this.bans
      .filter((ban) => ban.isBrokenBy(lineText))
      .map((ban) => new DeterminismViolation(ban, { path, lineNumber: index + 1, lineText })));
  }
}
