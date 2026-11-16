import SurfaceRatchetHistory from './SurfaceRatchetHistory.ts';
import SurfaceRefusal from './SurfaceRefusal.ts';

const result = new SurfaceRatchetHistory(process.cwd()).check('origin/main');
if (result instanceof SurfaceRefusal) {
  process.stderr.write(`${result.reason}\n`);
  process.exitCode = 1;
} else if (result.length > 0) {
  process.stderr.write(`Public surface ratchet or route-change list grew since the merge base:\n${result.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Public surface ratchet did not grow.\n');
}
