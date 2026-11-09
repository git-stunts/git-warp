import { checkSourceReachability } from './SourceReachabilityGate.ts';

const report = checkSourceReachability(process.cwd(), { base: 'origin/main' });
if (report.violations.length > 0) {
  for (const violation of report.violations) process.stderr.write(`source-reachability: ${violation}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write('Source allowance inventory did not grow from its accepted basis.\n');
}
