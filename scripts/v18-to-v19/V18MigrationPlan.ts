import {
  buildCheckpointRef,
  buildCoverageRef,
  buildStateCacheRef,
  buildSubstrateVersionRef,
  buildWritersPrefix,
  parseWriterIdFromRef,
  REF_PREFIX,
  validateGraphName,
} from '../../src/domain/utils/RefLayout.ts';
import { textDecode } from '../../src/domain/utils/bytes.ts';
import { CURRENT_SUBSTRATE_MARKER } from '../../src/infrastructure/adapters/SubstrateVersionGate.ts';
import { readV18PatchCommit } from './V18PatchCommit.ts';
import {
  listV18MigrationRefs,
  readV18MigrationRef,
  runV18MigrationGit,
  v18MigrationGitText,
} from './V18MigrationGit.ts';

export type V18MigrationWriterPlan = Readonly<{
  commitCount: number;
  currentCount: number;
  encryptedCount: number;
  head: string;
  legacyCount: number;
  refName: string;
  writer: string;
}>;

export type V18MigrationPlan = Readonly<{
  derivedRefs: Readonly<Record<string, string>>;
  graph: string;
  markerRef: string;
  preservedRefs: Readonly<Record<string, string>>;
  repositoryPath: string;
  status: 'current' | 'empty' | 'migration-required';
  writers: readonly V18MigrationWriterPlan[];
}>;

/** Inventories every graph ref and validates all writer commits before scratch work. */
export async function planV18ToV19Migration(options: Readonly<{
  graph: string;
  passphraseAvailable: boolean;
  repositoryPath: string;
}>): Promise<V18MigrationPlan> {
  validateGraphName(options.graph);
  const markerRef = buildSubstrateVersionRef(options.graph);
  const graphPrefix = `${REF_PREFIX}/${options.graph}/`;
  const refs = await listV18MigrationRefs(options.repositoryPath, graphPrefix);
  const markerOid = await readV18MigrationRef(options.repositoryPath, markerRef);
  if (markerOid !== null) {
    await requireCurrentMarker(options.repositoryPath, markerOid);
    return migrationPlan(options, markerRef, 'current', {}, {}, []);
  }
  if (refs.length === 0) {
    return migrationPlan(options, markerRef, 'empty', {}, {}, []);
  }

  const writerPrefix = buildWritersPrefix(options.graph);
  const derivedNames = new Set([
    buildCheckpointRef(options.graph),
    buildCoverageRef(options.graph),
    buildStateCacheRef(options.graph),
  ]);
  const recoveryPrefix = `${graphPrefix}recovery/`;
  const retiredCheckpointPrefix = `${graphPrefix}checkpoints/`;
  const preservedPrefixes = [
    `${graphPrefix}audit/`,
    `${graphPrefix}intents/`,
    `${graphPrefix}strand-braids/`,
    `${graphPrefix}strand-overlays/`,
    `${graphPrefix}strands/`,
    `${graphPrefix}trust/`,
  ];
  const writerRefs: string[] = [];
  const derivedRefs: Record<string, string> = {};
  const preservedRefs: Record<string, string> = {};
  for (const refName of refs) {
    if (refName.startsWith(writerPrefix)) {
      writerRefs.push(refName);
      continue;
    }
    if (derivedNames.has(refName)) {
      derivedRefs[refName] = await requireRef(options.repositoryPath, refName);
      continue;
    }
    if (refName.startsWith(retiredCheckpointPrefix)) {
      derivedRefs[refName] = await requireCommitRef(options.repositoryPath, refName);
      continue;
    }
    if (preservedPrefixes.some((prefix) => refName.startsWith(prefix))) {
      preservedRefs[refName] = await requireCommitRef(options.repositoryPath, refName);
      continue;
    }
    if (!refName.startsWith(recoveryPrefix)) {
      throw new Error(`unsupported graph ref blocks v18-to-v19 migration: ${refName}`);
    }
  }
  if (writerRefs.length === 0) {
    throw new Error(`timeline '${options.graph}' has retained state but no writer refs`);
  }
  const writers: V18MigrationWriterPlan[] = [];
  for (const refName of writerRefs.sort()) {
    writers.push(await planWriter({
      ...options,
      refName,
    }));
  }
  return migrationPlan(
    options,
    markerRef,
    'migration-required',
    derivedRefs,
    preservedRefs,
    writers,
  );
}

async function planWriter(options: Readonly<{
  graph: string;
  passphraseAvailable: boolean;
  refName: string;
  repositoryPath: string;
}>): Promise<V18MigrationWriterPlan> {
  const writer = parseWriterIdFromRef(options.refName);
  if (writer === null) {
    throw new Error(`invalid writer ref: ${options.refName}`);
  }
  const head = await requireRef(options.repositoryPath, options.refName);
  const output = await v18MigrationGitText(options.repositoryPath, [
    'rev-list',
    '--reverse',
    options.refName,
  ]);
  const commits = output === '' ? [] : output.split('\n').filter(Boolean);
  let legacyCount = 0;
  let currentCount = 0;
  let encryptedCount = 0;
  let previous: string | null = null;
  for (const sha of commits) {
    const patch = await readV18PatchCommit(options.repositoryPath, sha);
    if (
      patch.graph !== options.graph
      || patch.writer !== writer
      || (patch.commit.parents[0] ?? null) !== previous
    ) {
      throw new Error(`writer chain identity or parent mismatch at ${sha}`);
    }
    if (patch.storage.kind === 'current') {
      currentCount += 1;
    } else {
      legacyCount += 1;
      if (patch.storage.encrypted) {
        encryptedCount += 1;
      }
    }
    previous = sha;
  }
  if (previous !== head) {
    throw new Error(`writer chain ${options.refName} did not inventory to its head`);
  }
  if (encryptedCount > 0 && !options.passphraseAvailable) {
    throw new Error(
      `${options.refName} contains encrypted legacy patches; set `
        + 'GIT_WARP_MIGRATION_PASSPHRASE before retrying',
    );
  }
  return Object.freeze({
    commitCount: commits.length,
    currentCount,
    encryptedCount,
    head,
    legacyCount,
    refName: options.refName,
    writer,
  });
}

async function requireCurrentMarker(repositoryPath: string, oid: string): Promise<void> {
  const type = await v18MigrationGitText(repositoryPath, ['cat-file', '-t', oid]);
  const bytes = type === 'blob'
    ? await runV18MigrationGit(repositoryPath, ['cat-file', 'blob', oid])
    : null;
  if (bytes === null || textDecode(bytes) !== CURRENT_SUBSTRATE_MARKER) {
    throw new Error(`unsupported retained-substrate marker: ${oid}`);
  }
}

async function requireRef(repositoryPath: string, refName: string): Promise<string> {
  const oid = await readV18MigrationRef(repositoryPath, refName);
  if (oid === null) {
    throw new Error(`required ref disappeared: ${refName}`);
  }
  return oid;
}

async function requireCommitRef(repositoryPath: string, refName: string): Promise<string> {
  const oid = await requireRef(repositoryPath, refName);
  const objectType = await v18MigrationGitText(repositoryPath, ['cat-file', '-t', oid]);
  if (objectType !== 'commit') {
    throw new Error(
      `retained ref requires a pre-v18 migration before v19: ${refName} targets ${objectType}`,
    );
  }
  return oid;
}

function migrationPlan(
  options: Readonly<{ graph: string; repositoryPath: string }>,
  markerRef: string,
  status: V18MigrationPlan['status'],
  derivedRefs: Readonly<Record<string, string>>,
  preservedRefs: Readonly<Record<string, string>>,
  writers: readonly V18MigrationWriterPlan[],
): V18MigrationPlan {
  return Object.freeze({
    derivedRefs: Object.freeze({ ...derivedRefs }),
    graph: options.graph,
    markerRef,
    preservedRefs: Object.freeze({ ...preservedRefs }),
    repositoryPath: options.repositoryPath,
    status,
    writers: Object.freeze([...writers]),
  });
}
