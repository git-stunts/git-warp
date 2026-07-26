import { buildStateCacheRef, REF_PREFIX } from '../../src/domain/utils/RefLayout.ts';
import type { V18MigrationPlan } from './V18MigrationPlan.ts';
import type { V18PreparedMigration } from './V18MigrationScratch.ts';
import {
  readV18MigrationRef,
  runV18MigrationGit,
  v18MigrationGitText,
} from './V18MigrationGit.ts';

const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;

export type V18MigrationFinalization = Readonly<{
  promotedRefs: Readonly<Record<string, string>>;
  recoveryPrefix: string;
  recoveryRefs: Readonly<Record<string, string>>;
}>;

/** Atomically archives old refs and promotes a scratch-proven v19 graph. */
export async function finalizeV18Migration(options: Readonly<{
  plan: V18MigrationPlan;
  prepared: V18PreparedMigration;
  recoveryId?: string;
}>): Promise<V18MigrationFinalization> {
  const recoveryId = options.recoveryId ?? timestampId();
  requireRecoveryId(recoveryId);
  const graphPrefix = `${REF_PREFIX}/${options.plan.graph}/`;
  const recoveryPrefix = `${graphPrefix}recovery/v18-to-v19/${recoveryId}`;
  const sourceRefs = sourceRefsFor(options.plan);
  const importedRefs = await importPreparedRefs(
    options.plan.repositoryPath,
    options.prepared,
    recoveryId,
  );
  try {
    const recoveryRefs = await buildRecoveryRefs(
      options.plan,
      sourceRefs,
      recoveryPrefix,
    );
    await applyRefTransaction(
      options.plan.repositoryPath,
      sourceRefs,
      options.prepared.desiredRefs,
      recoveryRefs,
    );
    await verifyPromotedRefs(
      options.plan.repositoryPath,
      sourceRefs,
      options.prepared.desiredRefs,
    );
    return Object.freeze({
      promotedRefs: options.prepared.desiredRefs,
      recoveryPrefix,
      recoveryRefs,
    });
  } finally {
    await deleteImportRefs(options.plan.repositoryPath, importedRefs);
  }
}

/** Reverses a just-promoted graph only while every promoted ref is unchanged. */
export async function rollbackV18Migration(options: Readonly<{
  finalization: V18MigrationFinalization;
  plan: V18MigrationPlan;
}>): Promise<void> {
  const sourceRefs = sourceRefsFor(options.plan);
  const input = transactionHeader();
  for (const [refName, desiredOid] of sortedEntries(
    options.finalization.promotedRefs,
  )) {
    const oldOid = sourceRefs[refName];
    input.push(oldOid === undefined
      ? `delete ${refName} ${desiredOid}`
      : `update ${refName} ${oldOid} ${desiredOid}`);
  }
  for (const [refName, oldOid] of sortedEntries(sourceRefs)) {
    if (options.finalization.promotedRefs[refName] === undefined) {
      input.push(`create ${refName} ${oldOid}`);
    }
  }
  input.push('prepare', 'commit', '');
  await v18MigrationGitText(
    options.plan.repositoryPath,
    ['update-ref', '--stdin'],
    { input: input.join('\n') },
  );
}

function sourceRefsFor(plan: V18MigrationPlan): Readonly<Record<string, string>> {
  const refs: Record<string, string> = { ...plan.derivedRefs };
  for (const writer of plan.writers) {
    refs[writer.refName] = writer.head;
  }
  return Object.freeze(refs);
}

async function importPreparedRefs(
  repositoryPath: string,
  prepared: V18PreparedMigration,
  recoveryId: string,
): Promise<Readonly<Record<string, string>>> {
  const imported: Record<string, string> = {};
  for (const [refName, expectedOid] of sortedEntries(prepared.desiredRefs)) {
    const relative = refName.slice('refs/'.length);
    const importRef = `refs/warp-migration-import/v18-to-v19/${recoveryId}/${relative}`;
    await v18MigrationGitText(repositoryPath, [
      'fetch',
      '-q',
      '--no-tags',
      prepared.scratchPath,
      `+${refName}:${importRef}`,
    ]);
    const actualOid = await readV18MigrationRef(repositoryPath, importRef);
    if (actualOid !== expectedOid) {
      throw new Error(`imported ref mismatch: ${importRef}`);
    }
    imported[importRef] = expectedOid;
  }
  return Object.freeze(imported);
}

async function buildRecoveryRefs(
  plan: V18MigrationPlan,
  sourceRefs: Readonly<Record<string, string>>,
  recoveryPrefix: string,
): Promise<Readonly<Record<string, string>>> {
  const graphPrefix = `${REF_PREFIX}/${plan.graph}/`;
  const recovery: Record<string, string> = {};
  for (const [refName, oid] of sortedEntries(sourceRefs)) {
    recovery[`${recoveryPrefix}/refs/${refName.slice(graphPrefix.length)}`] = oid;
  }
  const stateCacheOid = sourceRefs[buildStateCacheRef(plan.graph)];
  if (stateCacheOid !== undefined) {
    for (const oid of await readRetainedPayloadOids(plan.repositoryPath, stateCacheOid)) {
      recovery[`${recoveryPrefix}/retained-payloads/${oid}`] = oid;
    }
  }
  for (const refName of Object.keys(recovery)) {
    if (await readV18MigrationRef(plan.repositoryPath, refName) !== null) {
      throw new Error(`recovery ref already exists: ${refName}`);
    }
  }
  return Object.freeze(recovery);
}

async function readRetainedPayloadOids(
  repositoryPath: string,
  stateCacheOid: string,
): Promise<readonly string[]> {
  const bytes = await runV18MigrationGit(
    repositoryPath,
    ['cat-file', 'blob', stateCacheOid],
  );
  const value: unknown = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const oids = new Set<string>();
  collectPayloadOids(value, oids);
  for (const oid of oids) {
    await v18MigrationGitText(repositoryPath, ['cat-file', '-e', oid]);
  }
  return Object.freeze([...oids].sort());
}

function collectPayloadOids(value: unknown, oids: Set<string>): void {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectPayloadOids(entry, oids);
    }
    return;
  }
  if (value === null || typeof value !== 'object') {
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (key === 'payloadRef' && typeof entry === 'string' && OID_PATTERN.test(entry)) {
      oids.add(entry);
    } else {
      collectPayloadOids(entry, oids);
    }
  }
}

async function applyRefTransaction(
  repositoryPath: string,
  sourceRefs: Readonly<Record<string, string>>,
  desiredRefs: Readonly<Record<string, string>>,
  recoveryRefs: Readonly<Record<string, string>>,
): Promise<void> {
  const input = transactionHeader();
  for (const [refName, oid] of sortedEntries(recoveryRefs)) {
    input.push(`create ${refName} ${oid}`);
  }
  for (const [refName, desiredOid] of sortedEntries(desiredRefs)) {
    const oldOid = sourceRefs[refName];
    input.push(oldOid === undefined
      ? `create ${refName} ${desiredOid}`
      : `update ${refName} ${desiredOid} ${oldOid}`);
  }
  for (const [refName, oldOid] of sortedEntries(sourceRefs)) {
    if (desiredRefs[refName] === undefined) {
      input.push(`delete ${refName} ${oldOid}`);
    }
  }
  input.push('prepare', 'commit', '');
  await v18MigrationGitText(repositoryPath, ['update-ref', '--stdin'], {
    input: input.join('\n'),
  });
}

async function verifyPromotedRefs(
  repositoryPath: string,
  sourceRefs: Readonly<Record<string, string>>,
  desiredRefs: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [refName, oid] of sortedEntries(desiredRefs)) {
    if (await readV18MigrationRef(repositoryPath, refName) !== oid) {
      throw new Error(`promoted ref mismatch: ${refName}`);
    }
  }
  for (const refName of Object.keys(sourceRefs)) {
    if (
      desiredRefs[refName] === undefined
      && await readV18MigrationRef(repositoryPath, refName) !== null
    ) {
      throw new Error(`retired ref still exists: ${refName}`);
    }
  }
}

async function deleteImportRefs(
  repositoryPath: string,
  importedRefs: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [refName, oid] of sortedEntries(importedRefs)) {
    await v18MigrationGitText(repositoryPath, ['update-ref', '-d', refName, oid]);
  }
}

function transactionHeader(): string[] {
  return ['start'];
}

function sortedEntries(
  value: Readonly<Record<string, string>>,
): ReadonlyArray<readonly [string, string]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
}

function timestampId(): string {
  return new Date().toISOString().replace(/[^0-9A-Za-z]/gu, '');
}

function requireRecoveryId(value: string): void {
  if (!/^[0-9A-Za-z][0-9A-Za-z._-]{0,63}$/u.test(value)) {
    throw new Error('recoveryId must be a branch-safe token of at most 64 characters');
  }
}
