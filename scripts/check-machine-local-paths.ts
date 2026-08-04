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
