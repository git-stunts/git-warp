// SPDX-License-Identifier: Apache-2.0

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { DeterminismScanRefusal } from './DeterminismScanRefusal.ts';

/**
 * Lists every regular file under `directory`, whatever its extension, as
 * repository-relative `/` paths in code-unit order. There is no extension
 * filter to go stale: a `.js`-only filter is how the gate once scanned
 * nothing. An entry that is neither a regular file nor a directory (a
 * symbolic link, a socket) refuses the scan instead of being skipped.
 */
export function listDomainFiles(root: string, directory: string): readonly string[] | DeterminismScanRefusal {
  const files: string[] = [];
  const pending: string[] = [directory];
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    for (const entry of readdirSync(join(root, next), { withFileTypes: true })) {
      const path = `${next}/${entry.name}`;
      if (entry.isDirectory()) {
        pending.push(path);
      } else if (entry.isFile()) {
        files.push(path);
      } else {
        return new DeterminismScanRefusal(`${path} is neither a regular file nor a directory`);
      }
    }
  }
  return files.sort();
}
