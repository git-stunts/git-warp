import type { V18CommitIdentity, V18PatchCommit } from './V18PatchCommit.ts';
import { readV18PatchCommit } from './V18PatchCommit.ts';
import { readV18MigrationRef, v18MigrationGitText } from './V18MigrationGit.ts';
import type { V18MigrationGitCommitWriter } from './V18MigrationGitCommitWriter.ts';
import type { V18MigrationGitObjectReader } from './V18MigrationGitObjectReader.ts';
import V18PatchTranslator from './V18PatchTranslator.ts';
import {
  reportV18MigrationProgress,
  type V18MigrationProgressReporter,
} from './V18MigrationProgress.ts';

export type V18WriterChainRewrite = Readonly<{
  commitCount: number;
  newHead: string;
  oldHead: string;
  refName: string;
  translatedCount: number;
  writer: string;
}>;

/** Recreates one writer chain in order, translating only legacy patch payloads. */
export async function rewriteV18WriterChain(
  options: Readonly<{
    commitWriter?: V18MigrationGitCommitWriter;
    commitMap?: Map<string, string>;
    graph: string;
    objectReader?: V18MigrationGitObjectReader;
    progress?: V18MigrationProgressReporter;
    refName: string;
    repositoryPath: string;
    translator: V18PatchTranslator;
    writer: string;
  }>
): Promise<V18WriterChainRewrite> {
  const oldHead = await readV18MigrationRef(options.repositoryPath, options.refName);
  if (oldHead === null) {
    throw new Error(`writer ref disappeared: ${options.refName}`);
  }
  const commits = await listWriterCommits(options.repositoryPath, options.refName);
  let previousOld: string | null = null;
  let previousNew: string | null = null;
  let translatedCount = 0;
  let completed = 0;
  reportV18MigrationProgress(options.progress, {
    completed,
    message: 'translating writer chain',
    phase: 'rewrite',
    total: commits.length,
    writer: options.writer,
  });
  for (const sha of commits) {
    const patch = await readV18PatchCommit(options.repositoryPath, sha, options.objectReader);
    requirePatchIdentity(patch, options.graph, options.writer);
    requireLinearParent(patch, previousOld);
    const translated =
      patch.storage.kind === 'current'
        ? { message: patch.commit.message, tree: patch.commit.tree }
        : await options.translator.translate(patch);
    if (patch.storage.kind !== 'current') {
      translatedCount += 1;
    }
    const newSha = await createCommit(
      options.repositoryPath,
      patch,
      translated.tree,
      translated.message,
      previousNew,
      options.commitWriter
    );
    if (patch.storage.kind === 'current' && previousNew === previousOld && newSha !== sha) {
      throw new Error(`current commit ${sha} was not recreated byte-identically`);
    }
    previousOld = sha;
    previousNew = newSha;
    options.commitMap?.set(sha, newSha);
    completed += 1;
    reportV18MigrationProgress(options.progress, {
      completed,
      message: 'translating writer chain',
      phase: 'rewrite',
      total: commits.length,
      writer: options.writer,
    });
  }
  if (previousNew === null) {
    throw new Error(`writer ref has no commits: ${options.refName}`);
  }
  await v18MigrationGitText(options.repositoryPath, [
    'update-ref',
    options.refName,
    previousNew,
    oldHead,
  ]);
  return Object.freeze({
    commitCount: commits.length,
    newHead: previousNew,
    oldHead,
    refName: options.refName,
    translatedCount,
    writer: options.writer,
  });
}

async function listWriterCommits(
  repositoryPath: string,
  refName: string
): Promise<readonly string[]> {
  const output = await v18MigrationGitText(repositoryPath, ['rev-list', '--reverse', refName]);
  return Object.freeze(output === '' ? [] : output.split('\n').filter(Boolean));
}

function requirePatchIdentity(patch: V18PatchCommit, graph: string, writer: string): void {
  if (patch.graph !== graph || patch.writer !== writer) {
    throw new Error(`commit ${patch.commit.sha} identity does not match ${graph}/${writer}`);
  }
}

function requireLinearParent(patch: V18PatchCommit, previousOld: string | null): void {
  const parent = patch.commit.parents[0] ?? null;
  if (parent !== previousOld) {
    throw new Error(`writer commit ${patch.commit.sha} does not form one complete linear chain`);
  }
}

async function createCommit(
  repositoryPath: string,
  patch: V18PatchCommit,
  tree: string,
  message: string,
  parent: string | null,
  commitWriter?: V18MigrationGitCommitWriter
): Promise<string> {
  if (commitWriter !== undefined) {
    return await commitWriter.writeCommit({
      author: patch.commit.author,
      committer: patch.commit.committer,
      message,
      parent,
      tree,
    });
  }
  const args = ['commit-tree', tree, '-F', '-'];
  if (parent !== null) {
    args.push('-p', parent);
  }
  return await v18MigrationGitText(repositoryPath, args, {
    env: commitEnvironment(patch.commit.author, patch.commit.committer),
    input: message,
  });
}

function commitEnvironment(
  author: V18CommitIdentity,
  committer: V18CommitIdentity
): Readonly<Record<string, string>> {
  return Object.freeze({
    GIT_AUTHOR_NAME: author.name,
    GIT_AUTHOR_EMAIL: author.email,
    GIT_AUTHOR_DATE: `${author.timestamp} ${author.timezone}`,
    GIT_COMMITTER_NAME: committer.name,
    GIT_COMMITTER_EMAIL: committer.email,
    GIT_COMMITTER_DATE: `${committer.timestamp} ${committer.timezone}`,
  });
}
