#!/usr/bin/env node
import { checkSourceReachability, UNREACHABLE_SOURCE_ALLOWLIST_PATH } from './SourceReachabilityGate.ts';

const report = checkSourceReachability(process.cwd());
if (report.violations.length > 0) {
  for (const violation of report.violations) process.stderr.write(`source-reachability: ${violation}\n`);
  process.stderr.write(`source-reachability: remove or connect new dead files; ${UNREACHABLE_SOURCE_ALLOWLIST_PATH} may only shrink\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`source-reachability: working-tree inventory matches (${String(report.reached)} reached; ${String(report.unreachable.length)} allowances); CI also checks history\n`);
}
