#!/usr/bin/env node
import { checkSourceReachability, UNREACHABLE_SOURCE_ALLOWLIST_PATH } from './SourceReachabilityGate.ts';

const report = checkSourceReachability(process.cwd());
if (report.violations.length > 0) {
  for (const violation of report.violations) process.stderr.write(`source-reachability: ${violation}\n`);
  process.stderr.write(`source-reachability: delete the dead file, or list it with its owning issue in ${UNREACHABLE_SOURCE_ALLOWLIST_PATH}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`source-reachability: PASS (${String(report.reached)} reached; ${String(report.unreachable.length)} allowed unreachable)\n`);
}
