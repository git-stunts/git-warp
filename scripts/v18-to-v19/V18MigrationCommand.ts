import { resolve } from 'node:path';

import {
  finalizeV18Migration,
  rollbackV18Migration,
  type V18MigrationFinalization,
} from './V18MigrationFinalizer.ts';
import {
  planV18ToV19Migration,
  type V18MigrationPlan,
} from './V18MigrationPlan.ts';
import {
  prepareV18MigrationScratch,
  verifyPromotedV19Repository,
} from './V18MigrationScratch.ts';
import {
  reportV18MigrationProgress,
  type V18MigrationProgressReporter,
} from './V18MigrationProgress.ts';

export type V18MigrationCommandReport = Readonly<{
  finalization: V18MigrationFinalization | null;
  plan: V18MigrationPlan;
  scratchVerified: boolean;
  status: 'already-current' | 'empty' | 'migrated' | 'verified-dry-run';
}>;

/** Runs the fail-closed one-shot migration command. */
export async function runV18ToV19Migration(options: Readonly<{
  apply: boolean;
  graph: string;
  passphrase?: string;
  progress?: V18MigrationProgressReporter;
  recoveryId?: string;
  repositoryPath: string;
  scratchRoot?: string;
}>): Promise<V18MigrationCommandReport> {
  const repositoryPath = resolve(options.repositoryPath);
  const plan = await planV18ToV19Migration({
    graph: options.graph,
    passphraseAvailable: options.passphrase !== undefined,
    ...(options.progress === undefined ? {} : { progress: options.progress }),
    repositoryPath,
  });
  if (plan.status === 'current') {
    await verifyPromotedV19Repository(repositoryPath, options.graph);
    return report(plan, 'already-current', false, null);
  }
  if (plan.status === 'empty') {
    return report(plan, 'empty', false, null);
  }

  const prepared = await prepareV18MigrationScratch({
    plan,
    ...(options.passphrase === undefined ? {} : { passphrase: options.passphrase }),
    ...(options.progress === undefined ? {} : { progress: options.progress }),
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: resolve(options.scratchRoot) }),
  });
  try {
    if (!options.apply) {
      return report(plan, 'verified-dry-run', true, null);
    }
    const refreshed = await planV18ToV19Migration({
      graph: options.graph,
      passphraseAvailable: options.passphrase !== undefined,
      ...(options.progress === undefined ? {} : { progress: options.progress }),
      repositoryPath,
    });
    requireUnchangedPlan(plan, refreshed);
    reportV18MigrationProgress(options.progress, {
      message: 'atomically archiving source refs and promoting verified refs',
      phase: 'finalize',
    });
    const finalization = await finalizeV18Migration({
      plan,
      prepared,
      ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
    });
    try {
      reportV18MigrationProgress(options.progress, {
        message: 'verifying promoted refs through a disposable append and bounded reading',
        phase: 'verify',
      });
      await verifyPromotedV19Repository(repositoryPath, options.graph);
    } catch (verificationError) {
      try {
        await rollbackV18Migration({ finalization, plan });
      } catch (rollbackError) {
        throw new AggregateError(
          [verificationError, rollbackError],
          `v19 verification failed and automatic rollback could not complete; `
            + `use recovery refs below ${finalization.recoveryPrefix}`,
        );
      }
      throw new Error(
        'v19 verification failed; authoritative refs were rolled back and recovery refs retained',
        { cause: verificationError },
      );
    }
    return report(plan, 'migrated', true, finalization);
  } finally {
    await prepared.cleanup();
  }
}

function requireUnchangedPlan(
  before: V18MigrationPlan,
  after: V18MigrationPlan,
): void {
  if (
    after.status !== 'migration-required'
    || JSON.stringify(planIdentity(after)) !== JSON.stringify(planIdentity(before))
  ) {
    throw new Error(
      'retained state changed after scratch verification; no authoritative refs were updated',
    );
  }
}

function planIdentity(plan: V18MigrationPlan): unknown {
  return {
    derivedRefs: plan.derivedRefs,
    preservedRefs: plan.preservedRefs,
    writers: plan.writers.map((writer) => ({
      head: writer.head,
      refName: writer.refName,
    })),
  };
}

function report(
  plan: V18MigrationPlan,
  status: V18MigrationCommandReport['status'],
  scratchVerified: boolean,
  finalization: V18MigrationFinalization | null,
): V18MigrationCommandReport {
  return Object.freeze({
    finalization,
    plan,
    scratchVerified,
    status,
  });
}
