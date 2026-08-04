import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { GitMachineLocalPathGuard } from './GitMachineLocalPathGuard.ts';
import { MachineLocalPathPolicy } from './MachineLocalPathPolicy.ts';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const policy = new MachineLocalPathPolicy();
const guard = new GitMachineLocalPathGuard(ROOT, policy);
const mode = process.argv[2] ?? '--working-tree';
let offenders: string[];

if (mode === '--working-tree') {
  offenders = guard.findWorkingTreePaths();
} else if (mode === '--staged') {
  offenders = guard.findStagedPaths();
} else if (mode === '--pre-push') {
  offenders = guard.findOutgoingObjects(readFileSync(0, 'utf8'), process.argv[3] ?? '');
} else if (mode === '--tree') {
  offenders = guard.findTreePaths(process.argv[3] ?? '');
} else {
  process.stderr.write(`Unknown machine-local path scan mode: ${mode}\n`);
  process.exit(2);
}

if (offenders.length > 0) {
  process.stderr.write(
    `Machine-local absolute paths are forbidden in ${mode} content:\n` +
      offenders.map((path) => `- ${path}`).join('\n') +
      '\n'
  );
  process.exitCode = 1;
}
