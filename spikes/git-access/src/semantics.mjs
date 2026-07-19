import { Buffer } from 'node:buffer';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { createBackend } from './backends.mjs';
import { createFixture } from './fixture.mjs';
import {
  executeGit,
  FastImportWriter,
  parseRawTree,
  PersistentCatFile,
  PersistentMktree,
} from './git-process.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const results = [];

await record('fast-import visibility is checkpoint-gated', testCheckpointVisibility);
await record('bounded one-shot output terminates on overflow', testBoundedOutputOverflow);
await record('one-shot input rejects safely after early Git exit', testEarlyExitInput);
await record('failed fixture setup removes its temporary repository', testFixtureFailureCleanup);
await record('persistent batch reader drains after a missing object', testBatchReaderDrain);
await record(
  'aborted fast-import object remains unreachable through Git GC',
  testAbortUnreachable
);
await record('concurrent fast-import sessions remain readable', testConcurrentWriters);
await record('active fast-import survives concurrent default Git GC', testWriterAcrossDefaultGc);
await record('active fast-import survives concurrent prune-now Git GC', testWriterAcrossPruneNowGc);
await record('active persistent reader survives repack', testReaderAcrossRepack);
await record('persistent reader discovers post-start objects', testReaderDiscoversObject);
await record('stock Git supports atomic multi-ref CAS', testAtomicRefTransaction);
await probeSha256Support();
await probeAlternatesSupport();
await probePackedRefSupport();

const report = Object.freeze({
  generatedAt: new Date().toISOString(),
  results: Object.freeze(results),
});
const stamp = timestamp(new Date());
const resultsDirectory = join(ROOT, 'results');
await mkdir(resultsDirectory, { recursive: true });
await writeFile(
  join(resultsDirectory, `${stamp}-semantics.json`),
  `${JSON.stringify(report, null, 2)}\n`,
  'utf8'
);
await writeFile(join(resultsDirectory, `${stamp}-semantics.md`), renderMarkdown(report), 'utf8');
process.stdout.write(`Wrote results/${stamp}-semantics.json and results/${stamp}-semantics.md\n`);
assertRequiredSemantics(results);

async function testCheckpointVisibility() {
  return await withBareRepository('sha1', async (gitDir) => {
    const content = Buffer.from('checkpoint visibility\n');
    const writer = new FastImportWriter(gitDir, { unpackLimit: 1 });
    const oid = await writer.writeBlob(content);
    const visibleBeforeCheckpoint = await objectExists(gitDir, oid);
    await writer.close();
    const visibleAfterCheckpoint = await objectExists(gitDir, oid);
    assert(!visibleBeforeCheckpoint, 'Object became visible before checkpoint');
    assert(visibleAfterCheckpoint, 'Object was not visible after checkpoint');
    return { oid, visibleAfterCheckpoint, visibleBeforeCheckpoint };
  });
}

async function testAbortUnreachable() {
  return await withBareRepository('sha1', async (gitDir) => {
    const writer = new FastImportWriter(gitDir, { unpackLimit: 1 });
    const oid = await writer.writeBlob(Buffer.from('abort me\n'));
    await writer.abort();
    const visibleAfterAbort = await objectExists(gitDir, oid);
    assert(!visibleAfterAbort, 'Aborted fast-import object became visible');
    await executeGit(gitDir, ['gc', '--prune=now']);
    const visibleAfterGc = await objectExists(gitDir, oid);
    assert(!visibleAfterGc, 'Aborted fast-import object became visible after Git GC');
    return { oid, visibleAfterAbort, visibleAfterGc };
  });
}

async function testBoundedOutputOverflow() {
  return await withBareRepository('sha1', async (gitDir) => {
    const oid = (
      await executeGit(gitDir, ['hash-object', '-w', '--stdin'], {
        input: Buffer.alloc(64 * 1024, 0x61),
      })
    ).trim();
    let rejected = false;
    try {
      await executeGit(gitDir, ['cat-file', 'blob', oid], { encoding: null, maxBuffer: 1024 });
    } catch (error) {
      rejected = error instanceof Error && error.message.includes('stdout exceeded 1024 bytes');
    }
    assert(rejected, 'Bounded Git output did not reject with the overflow error');
    return { maxBuffer: 1024, oid, rejected };
  });
}

async function testEarlyExitInput() {
  const inputBytes = 16 * 1024 * 1024;
  let rejection = null;
  try {
    await executeGit(null, ['--invalid-git-warp-spike-option'], {
      input: Buffer.alloc(inputBytes, 0x61),
    });
  } catch (error) {
    rejection = error instanceof Error ? error.message : String(error);
  }
  assert(rejection !== null, 'Git accepted an intentionally invalid option');
  return { inputBytes, rejected: true };
}

async function testFixtureFailureCleanup() {
  const before = new Set(await fixtureTemporaryDirectories());
  let rejected = false;
  try {
    await createFixture({
      fanout: 1,
      objectCount: 1,
      packed: false,
      payloadBytes: 1,
      payloadProfile: 'repetitive',
    });
  } catch {
    rejected = true;
  }
  const leaked = (await fixtureTemporaryDirectories()).filter((name) => !before.has(name));
  assert(rejected, 'Invalid fixture payload unexpectedly succeeded');
  assert(leaked.length === 0, `Failed fixture setup leaked: ${leaked.join(', ')}`);
  return { leaked, rejected };
}

async function fixtureTemporaryDirectories() {
  return (await readdir(tmpdir())).filter((name) => name.startsWith('git-warp-git-access-'));
}

async function testBatchReaderDrain() {
  return await withBareRepository('sha1', async (gitDir) => {
    const leftContent = Buffer.from('left batch object\n');
    const rightContent = Buffer.from('right batch object\n');
    const leftOid = (
      await executeGit(gitDir, ['hash-object', '-w', '--stdin'], { input: leftContent })
    ).trim();
    const rightOid = (
      await executeGit(gitDir, ['hash-object', '-w', '--stdin'], { input: rightContent })
    ).trim();
    const missingOid = '0'.repeat(40);
    const reader = new PersistentCatFile(gitDir, { buffered: true });
    try {
      let rejected = false;
      try {
        await reader.contentsMany([leftOid, missingOid, rightOid]);
      } catch {
        rejected = true;
      }
      assert(rejected, 'Missing batched object was accepted');
      const right = await reader.contents(rightOid);
      assert(
        right.content.equals(rightContent),
        'Reader remained desynchronized after the failure'
      );
      return { leftOid, missingOid, rejected, rightOid };
    } finally {
      await reader.close();
    }
  });
}

async function testWriterAcrossDefaultGc() {
  return await testWriterAcrossGc(['gc']);
}

async function testWriterAcrossPruneNowGc() {
  return await testWriterAcrossGc(['gc', '--prune=now']);
}

async function testWriterAcrossGc(gcArguments) {
  return await withBareRepository('sha1', async (gitDir) => {
    const writer = new FastImportWriter(gitDir, { unpackLimit: 0 });
    const oid = await writer.writeBlob(Buffer.from('writer survives gc\n'));
    assert(!(await objectExists(gitDir, oid)), 'Active writer object became visible early');
    await executeGit(gitDir, gcArguments);
    await writer.close();
    assert(await objectExists(gitDir, oid), 'Writer object disappeared across Git GC');
    return {
      inventory: parseCountObjects(await executeGit(gitDir, ['count-objects', '-v'])),
      gcArguments,
      oid,
    };
  });
}

async function testConcurrentWriters() {
  return await withBareRepository('sha1', async (gitDir) => {
    const left = new FastImportWriter(gitDir, { unpackLimit: 1 });
    const right = new FastImportWriter(gitDir, { unpackLimit: 1 });
    const [leftOid, rightOid] = await Promise.all([
      left.writeBlob(Buffer.from('left writer\n')),
      right.writeBlob(Buffer.from('right writer\n')),
    ]);
    await Promise.all([left.close(), right.close()]);
    assert(await objectExists(gitDir, leftOid), 'Left writer object is missing');
    assert(await objectExists(gitDir, rightOid), 'Right writer object is missing');
    const inventory = parseCountObjects(await executeGit(gitDir, ['count-objects', '-v']));
    return { inventory, leftOid, rightOid };
  });
}

async function testReaderAcrossRepack() {
  const fixture = await createFixture({
    fanout: 16,
    objectCount: 64,
    packed: true,
    payloadBytes: 4096,
    payloadProfile: 'random',
  });
  const reader = new PersistentCatFile(fixture.gitDir, {
    config: ['core.packedGitWindowSize=8m', 'core.packedGitLimit=32m'],
  });
  try {
    const first = await reader.contents(fixture.blobs[0].oid);
    await executeGit(fixture.gitDir, ['repack', '-ad']);
    const firstAfterRepack = await reader.contents(fixture.blobs[0].oid);
    const last = await reader.contents(fixture.blobs.at(-1).oid);
    assert(first.content.equals(fixture.blobs[0].content), 'First read was invalid');
    assert(
      firstAfterRepack.content.equals(fixture.blobs[0].content),
      'Previously-read blob was invalid after repack'
    );
    assert(last.content.equals(fixture.blobs.at(-1).content), 'Post-repack read was invalid');
    return { firstOid: first.oid, lastOid: last.oid };
  } finally {
    await reader.close();
    await fixture.cleanup();
  }
}

async function testReaderDiscoversObject() {
  return await withBareRepository('sha1', async (gitDir) => {
    const reader = new PersistentCatFile(gitDir);
    try {
      const content = Buffer.from('written after reader startup\n');
      const oid = (
        await executeGit(gitDir, ['hash-object', '-w', '--stdin'], {
          input: content,
        })
      ).trim();
      const object = await reader.contents(oid);
      assert(object.content.equals(content), 'Persistent reader did not discover the object');
      return { oid };
    } finally {
      await reader.close();
    }
  });
}

async function testAtomicRefTransaction() {
  return await withBareRepository('sha1', async (gitDir) => {
    const emptyTree = (await executeGit(gitDir, ['mktree'], { input: '' })).trim();
    const firstCommit = (
      await executeGit(gitDir, ['commit-tree', emptyTree], {
        env: identityEnvironment(),
        input: 'first\n',
      })
    ).trim();
    const secondCommit = (
      await executeGit(gitDir, ['commit-tree', emptyTree, '-p', firstCommit], {
        env: identityEnvironment(),
        input: 'second\n',
      })
    ).trim();
    const source = 'refs/cas/source';
    const anchor = 'refs/cas/anchor';
    await executeGit(gitDir, ['update-ref', source, firstCommit]);
    await executeGit(gitDir, ['update-ref', '--no-deref', '--stdin'], {
      input: [
        'start',
        `verify ${source} ${firstCommit}`,
        `create ${anchor} ${firstCommit}`,
        'prepare',
        'commit',
        '',
      ].join('\n'),
    });
    const rejectedRef = 'refs/cas/must-not-exist';
    let staleTransactionRejected = false;
    try {
      await executeGit(gitDir, ['update-ref', '--no-deref', '--stdin'], {
        input: [
          'start',
          `verify ${source} ${secondCommit}`,
          `create ${rejectedRef} ${firstCommit}`,
          'prepare',
          'commit',
          '',
        ].join('\n'),
      });
    } catch {
      staleTransactionRejected = true;
    }
    assert(staleTransactionRejected, 'Stale multi-ref transaction was accepted');
    assert(!(await refExists(gitDir, rejectedRef)), 'Rejected transaction partially created a ref');
    return { anchor, firstCommit, source, staleTransactionRejected };
  });
}

async function probeSha256Support() {
  await withBareRepository('sha256', async (gitDir) => {
    const content = Buffer.from('sha256 object\n');
    const writer = new FastImportWriter(gitDir, { unpackLimit: 1 });
    const oid = (await writer.writeAll([content]))[0];
    const reader = new PersistentCatFile(gitDir);
    const mktree = new PersistentMktree(gitDir);
    try {
      const object = await reader.contents(oid);
      const treeOid = await mktree.write([`100644 blob ${oid}\tvalue.bin`]);
      const tree = await reader.contents(treeOid);
      const entries = parseRawTree(tree.content, 32);
      assert(oid.length === 64, 'SHA-256 blob OID has the wrong length');
      assert(treeOid.length === 64, 'SHA-256 tree OID has the wrong length');
      assert(object.content.equals(content), 'SHA-256 blob content changed');
      assert(entries[0]?.oid === oid, 'SHA-256 tree entry is invalid');
      results.push(pass('sha256', 'persistent-git', { oid, treeOid }));
    } finally {
      await Promise.all([reader.close(), mktree.close()]);
    }
    const fixture = { gitDir, objectFormat: 'sha256', oidBytes: 32 };
    for (const backend of ['nodegit', 'napi-libgit2', 'isomorphic-git']) {
      await probeBackend(
        'sha256',
        backend,
        async (candidate) => {
          if (candidate.capabilities.readBlob) {
            const actual = await candidate.readBlob(oid);
            assert(Buffer.from(actual).equals(content), 'SHA-256 read content changed');
            return { operation: 'read' };
          }
          if (candidate.capabilities.writeBlob) {
            const writtenOid = await candidate.writeBlob(Buffer.from(`${backend} sha256\n`));
            assert(writtenOid.length === 64, 'Backend returned a non-SHA-256 OID');
            assert(await objectExists(gitDir, writtenOid), 'Backend object is not Git-readable');
            return { operation: 'write', writtenOid };
          }
          return { unsupported: true };
        },
        fixture
      );
    }
  });
}

async function probeAlternatesSupport() {
  const temporaryPath = await mkdtemp(join(tmpdir(), 'git-warp-alternates-'));
  const source = join(temporaryPath, 'source.git');
  const target = join(temporaryPath, 'target.git');
  try {
    await createBareRepository(source, 'sha1');
    await createBareRepository(target, 'sha1');
    const content = Buffer.from('alternate object database\n');
    const oid = (
      await executeGit(source, ['hash-object', '-w', '--stdin'], { input: content })
    ).trim();
    const infoDirectory = join(target, 'objects', 'info');
    await mkdir(infoDirectory, { recursive: true });
    await writeFile(join(infoDirectory, 'alternates'), `${resolve(source, 'objects')}\n`, 'utf8');
    const fixture = { gitDir: target, objectFormat: 'sha1', oidBytes: 20 };
    for (const backend of ['git-persistent', 'nodegit', 'napi-libgit2', 'isomorphic-git']) {
      await probeBackend(
        'alternates',
        backend,
        async (candidate) => {
          if (!candidate.capabilities.readBlob) {
            return { unsupported: true };
          }
          const actual = await candidate.readBlob(oid);
          assert(Buffer.from(actual).equals(content), 'Alternate blob content changed');
          return { oid };
        },
        fixture
      );
    }
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
  }
}

async function probePackedRefSupport() {
  await withBareRepository('sha1', async (gitDir) => {
    const treeOid = (await executeGit(gitDir, ['mktree'], { input: '' })).trim();
    const mainOid = (
      await executeGit(gitDir, ['commit-tree', treeOid], {
        env: identityEnvironment(),
        input: 'main\n',
      })
    ).trim();
    const secondaryOid = (
      await executeGit(gitDir, ['commit-tree', treeOid, '-p', mainOid], {
        env: identityEnvironment(),
        input: 'secondary\n',
      })
    ).trim();
    await executeGit(gitDir, ['update-ref', 'refs/heads/main', mainOid]);
    await executeGit(gitDir, ['update-ref', 'refs/heads/secondary', secondaryOid]);
    await executeGit(gitDir, ['symbolic-ref', 'HEAD', 'refs/heads/main']);
    await executeGit(gitDir, ['pack-refs', '--all', '--prune']);
    const fixture = {
      commitOid: mainOid,
      gitDir,
      objectFormat: 'sha1',
      oidBytes: 20,
      refName: 'refs/heads/main',
    };
    for (const backend of ['git-persistent', 'nodegit', 'napi-libgit2', 'isomorphic-git']) {
      await probeBackend(
        'packed-ref',
        backend,
        async (candidate) => {
          if (!candidate.capabilities.resolveRef) {
            return { unsupported: true };
          }
          const actual = await candidate.resolveRef('refs/heads/secondary');
          assert(actual === secondaryOid, `Resolved ${actual}, expected ${secondaryOid}`);
          return { actual, expected: secondaryOid };
        },
        fixture
      );
    }
  });
}

async function probeBackend(feature, backendName, operation, fixture) {
  let backend;
  try {
    backend = await createBackend(backendName, fixture);
  } catch (error) {
    results.push(unsupported(feature, backendName, errorSummary(error)));
    return;
  }
  try {
    const details = await operation(backend);
    results.push(
      details.unsupported ? unsupported(feature, backendName) : pass(feature, backendName, details)
    );
  } catch (error) {
    results.push(failed(feature, backendName, errorSummary(error)));
  } finally {
    try {
      await backend.close();
    } catch (error) {
      results.push(failed(`${feature} cleanup`, backendName, errorSummary(error)));
    }
  }
}

async function record(name, operation) {
  try {
    results.push(pass(name, 'stock-git', await operation()));
  } catch (error) {
    results.push(
      Object.freeze({
        backend: 'stock-git',
        details: errorSummary(error),
        feature: name,
        status: 'failed',
      })
    );
  }
}

async function withBareRepository(objectFormat, operation) {
  const temporaryPath = await mkdtemp(join(tmpdir(), 'git-warp-semantics-'));
  const gitDir = join(temporaryPath, 'fixture.git');
  try {
    await createBareRepository(gitDir, objectFormat);
    return await operation(gitDir);
  } finally {
    await rm(temporaryPath, { recursive: true, force: true });
  }
}

async function createBareRepository(gitDir, objectFormat) {
  await executeGit(null, ['init', '--bare', `--object-format=${objectFormat}`, gitDir]);
}

async function objectExists(gitDir, oid) {
  try {
    await executeGit(gitDir, ['cat-file', '-e', oid]);
    return true;
  } catch {
    return false;
  }
}

async function refExists(gitDir, ref) {
  try {
    await executeGit(gitDir, ['show-ref', '--verify', '--quiet', ref]);
    return true;
  } catch {
    return false;
  }
}

function parseCountObjects(output) {
  return Object.freeze(
    Object.fromEntries(
      output
        .trim()
        .split('\n')
        .map((line) => {
          const separator = line.indexOf(': ');
          return [line.slice(0, separator), Number(line.slice(separator + 2))];
        })
    )
  );
}

function identityEnvironment() {
  return {
    ...process.env,
    GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
    GIT_AUTHOR_EMAIL: 'spike@git-warp.invalid',
    GIT_AUTHOR_NAME: 'git-warp spike',
    GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
    GIT_COMMITTER_EMAIL: 'spike@git-warp.invalid',
    GIT_COMMITTER_NAME: 'git-warp spike',
  };
}

function pass(feature, backend, details) {
  return Object.freeze({ backend, details, feature, status: 'supported' });
}

function unsupported(feature, backend, details = null) {
  return Object.freeze({ backend, details, feature, status: 'unsupported' });
}

function failed(feature, backend, details) {
  return Object.freeze({ backend, details, feature, status: 'failed' });
}

function errorSummary(error) {
  return {
    message: sanitizeErrorMessage(error instanceof Error ? error.message : String(error)),
    name: error instanceof Error ? error.name : typeof error,
  };
}

function sanitizeErrorMessage(message) {
  return message
    .replaceAll(process.cwd(), '<cwd>')
    .replaceAll(tmpdir(), '<tmp>')
    .replaceAll(homedir(), '<home>');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertRequiredSemantics(actualResults) {
  const permittedFailure = 'active fast-import survives concurrent prune-now Git GC';
  const required = actualResults.filter(
    (result) =>
      result.backend === 'stock-git' ||
      result.backend === 'persistent-git' ||
      result.backend === 'git-persistent'
  );
  const violations = required.filter(
    (result) => result.status !== 'supported' && result.feature !== permittedFailure
  );
  if (violations.length > 0) {
    throw new Error(
      `Required Git semantics failed: ${violations.map((result) => result.feature).join(', ')}`
    );
  }
}

function renderMarkdown(report) {
  const lines = [
    '# Git Access Semantic Compatibility',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    '| Feature | Backend | Status | Details |',
    '|---|---|---|---|',
  ];
  for (const result of report.results) {
    lines.push(
      `| ${escapeCell(result.feature)} | ${escapeCell(result.backend)}` +
        ` | ${result.status} | ${escapeCell(JSON.stringify(result.details))} |`
    );
  }
  return `${lines.join('\n')}\n`;
}

function escapeCell(value) {
  return String(value ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ');
}

function timestamp(date) {
  return date.toISOString().replace(/[:.]/gu, '-');
}
