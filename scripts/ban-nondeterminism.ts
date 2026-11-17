#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0
// © James Ross Ω FLYING•ROBOTS <https://github.com/flyingrobots>

/**
 * Determinism Drill Sergeant: bans nondeterministic APIs from domain code
 * (docs/ANTI_SLUDGE_POLICY.md section 9).
 *
 * It scans every file under src/domain/, whatever its extension, line by
 * line. Infrastructure adapters, tests, the CLI and scripts are outside the
 * deterministic boundary and are not scanned.
 *
 * Usage:
 *   npm run lint:determinism      (part of npm run lint)
 *   node scripts/ban-nondeterminism.ts
 *
 * Exit codes: 0 passed; 1 a banned call was found; 2 refused, because
 * src/domain is missing, holds no files, or holds an entry that is neither a
 * regular file nor a directory.
 *
 * There is no allowlist. Every hit is fixed, or the code does not ship. The
 * one exception is not the gate's own: the JSON.stringify ban is the Semgrep
 * rule ts-no-json-stringify-in-core, so a line that carries that rule's
 * anti-sludge inline quarantine marker (`nosemgrep: <rule> -- <ticket>`,
 * policy section 11) is exempt from that ban only.
 */

import { fileURLToPath } from 'node:url';

import { runDeterminismGate } from './determinism/runDeterminismGate.ts';

const REPOSITORY_ROOT = fileURLToPath(new URL('..', import.meta.url));

const run = runDeterminismGate(REPOSITORY_ROOT);
console.log(run.reportLines.join('\n'));
process.exitCode = run.exitCode;
