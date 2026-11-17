// SPDX-License-Identifier: Apache-2.0

import { DOMAIN_DETERMINISM_BANS } from './DomainDeterminismBans.ts';
import { DOMAIN_DIRECTORY, DomainDeterminismGate } from './DomainDeterminismGate.ts';

/** The gate's full report and the process exit code that goes with it. */
export type DeterminismGateRun = {
  readonly reportLines: readonly string[];
  /** 0 passed; 1 a banned call was found; 2 refused, because nothing could be scanned. */
  readonly exitCode: number;
};

/** Runs the domain determinism gate over the repository at `root`. */
export function runDeterminismGate(root: string): DeterminismGateRun {
  const outcome = new DomainDeterminismGate(root, DOMAIN_DETERMINISM_BANS).scan();
  return Object.freeze({
    reportLines: Object.freeze([`ban-nondeterminism: scanning ${DOMAIN_DIRECTORY}`, ...outcome.reportLines()]),
    exitCode: outcome.exitCode,
  });
}
