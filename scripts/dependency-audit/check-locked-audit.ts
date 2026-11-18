#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

/**
 * The locked dependency audit (npm run audit:locked; CI job type-firewall-audit).
 *
 * It runs `npm audit --json --omit=dev` and `npm audit --json` against the
 * committed lock at severity low, and compares the findings with
 * policy/audit-exceptions.json. An advisory in the published tree always
 * fails. A development-only advisory passes only while an unexpired exception
 * of at most 30 days lists it and the registry publishes no version outside
 * the advisory's range. An exception that matches no advisory fails.
 * See docs/operations/dependency-audit.md.
 *
 * Exit codes: 0 passed; 1 an advisory or exception failed; 2 refused, because
 * npm or the exception list could not establish a result.
 */

import { fileURLToPath } from 'node:url';

import { ExecFileCommandRunner } from './adapters/ExecFileCommandRunner.ts';
import { CalendarDate } from './CalendarDate.ts';
import { runLockedAudit } from './runLockedAudit.ts';

const REPOSITORY_ROOT = fileURLToPath(new URL('../..', import.meta.url));

const run = await runLockedAudit({
  root: REPOSITORY_ROOT,
  today: CalendarDate.containing(Date.now()),
  runner: new ExecFileCommandRunner(REPOSITORY_ROOT),
});
console.log(run.reportLines.join('\n'));
process.exitCode = run.exitCode;
