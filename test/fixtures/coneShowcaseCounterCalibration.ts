import '../../scripts/RequireDockerTests.ts';

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import process from 'node:process';

import GitPlumbing from '@git-stunts/plumbing';

import GitProcessCounter from '../../benchmarks/cone-showcase/GitProcessCounter.ts';

const [repository, traceDirectory, blobOid, emptyConfig, mode = 'standard', ...extra] = process.argv.slice(2);
if (repository === undefined || traceDirectory === undefined || blobOid === undefined || emptyConfig === undefined
  || extra.length > 0 || (mode !== 'standard' && mode !== 'missing-git')) {
  throw new TypeError('calibration requires repository, trace directory, blob OID, empty config and known mode');
}
const counter = new GitProcessCounter(traceDirectory);
const git = await GitPlumbing.createDefault({ cwd: repository });

async function measure(label: string, operation: () => Promise<void>): Promise<void> {
  await operation();
  const observed = counter.capture();
  const line = [label, String(observed.total), observed.files.join(',')].join('\t') + '\n';
  await new Promise<void>((resolve, reject) => {
    process.stdout.write(line, (error) => error === null || error === undefined ? resolve() : reject(error));
  });
}

if (mode === 'missing-git') {
  await measure('failedSpawn', async () => {
    await assert.rejects(git.execute({ args: ['rev-parse', '--is-inside-work-tree'] }));
  });
  counter.cleanupAfterWritersClosed();
} else {
  // Known real invocation and result are the oracle; trace files are the metric.
  await measure('executeStream', async () => {
    assert.equal(await git.execute({ args: ['rev-parse', '--is-inside-work-tree'] }), 'true');
  });
  await measure('captureAgain', async () => {});
  counter.cleanupAfterWritersClosed();

  const session = await git.openCatFileSession();
  try {
    await measure('openSession', async () => {
      const content = await session.read(blobOid);
      assert.equal(content.oid, blobOid);
      assert.equal(content.type, 'blob');
      assert.equal(new TextDecoder().decode(content.content), 'cone calibration\n');
    });
    await measure('reuseSession', async () => {
      assert.equal((await session.info(blobOid)).oid, blobOid);
    });
  } finally {
    await measure('closeSession', async () => { await session.close(); });
  }
  counter.cleanupAfterWritersClosed();

  await measure('sanitizerRefusal', async () => {
    await assert.rejects(
      git.executeStream({ args: ['-c', 'core.bare=true', 'rev-parse', '--is-inside-work-tree'] }),
      { name: 'ProhibitedFlagError' },
    );
  });
  counter.cleanupAfterWritersClosed();

  await measure('nonzeroExit', async () => {
    await assert.rejects(git.execute({ args: ['rev-parse', '--verify', 'definitely-missing-witness-ref'] }));
  });
  counter.cleanupAfterWritersClosed();

  await measure('nonGit', async () => {
    const version = execFileSync(process.execPath, ['--version'], { encoding: 'utf8', timeout: 15_000, maxBuffer: 65_536 });
    assert.ok(version.startsWith('v'));
  });
  counter.cleanupAfterWritersClosed();

  await measure('outsideScope', async () => {
    assert.equal(execFileSync('env', ['GIT_CONFIG_GLOBAL=' + emptyConfig, 'git', '-C', repository, 'rev-parse', '--is-inside-work-tree'], {
      encoding: 'utf8', timeout: 15_000, maxBuffer: 65_536,
    }), 'true\n');
  });
  counter.cleanupAfterWritersClosed();

  await measure('configuredDescendant', async () => {
    assert.equal(execFileSync('git', [
      '-C', repository, '-c', 'alias.witness-child=!git rev-parse --is-inside-work-tree', 'witness-child',
    ], { encoding: 'utf8', timeout: 15_000, maxBuffer: 65_536 }), 'true\n');
  });
  counter.cleanupAfterWritersClosed();

  await measure('afterReset', async () => {
    assert.equal(await git.execute({ args: ['rev-parse', '--is-inside-work-tree'] }), 'true');
  });
  counter.cleanupAfterWritersClosed();
}
