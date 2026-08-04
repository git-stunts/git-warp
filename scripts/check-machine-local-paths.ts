import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const policy = new MachineLocalPathPolicy();
const inventory = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { cwd: ROOT, encoding: 'utf8' }
);
const paths = inventory.split('\0').filter((path) => path.length > 0);
const offenders: string[] = [];

for (const path of paths) {
  const absolutePath = join(ROOT, path);
  const metadata = lstatSync(absolutePath);
  let content: string;
  if (metadata.isSymbolicLink()) {
    content = readlinkSync(absolutePath, 'utf8');
  } else {
    const bytes = readFileSync(absolutePath);
    if (bytes.includes(0)) {
      continue;
    }
    content = bytes.toString('utf8');
  }

  if (policy.containsMachineLocalPath(content)) {
    offenders.push(path);
  }
}

if (offenders.length > 0) {
  process.stderr.write(
    'Machine-local absolute paths are forbidden in tracked or unignored files:\n' +
      offenders.map((path) => `- ${path}`).join('\n') +
      '\n'
  );
  process.exitCode = 1;
}
