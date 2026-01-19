import { performance } from 'perf_hooks';
import GitPlumbing from '@git-stunts/plumbing';
import EmptyGraph from '../index.js';
import { mkdtempSync, rmSync, writeFileSync, createWriteStream } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

async function fastGenerate(tempDir, count) {
  const importPath = path.join(tempDir, 'import.txt');
  const stream = createWriteStream(importPath);
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    stream.write(`commit refs/heads/main\n`);
    stream.write(`mark :${i + 1}\n`);
    stream.write(`committer Stuntman <stunt@example.com> ${now + i} +0000\n`);
    const msg = `Node ${i} Payload`;
    stream.write(`data ${Buffer.byteLength(msg)}\n${msg}\n`);
    if (i > 0) {
      stream.write(`from :${i}\n`);
    } else {
      stream.write(`deleteall\n`);
    }
    stream.write(`\n`);
  }
  await new Promise(resolve => stream.end(resolve));
  execSync(`git fast-import < import.txt`, { cwd: tempDir });
}

async function runBenchmark(nodeCount) {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), `eg-bench-${nodeCount}-`));
  const plumbing = GitPlumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ['init', '-b', 'main'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Stuntman'] });
  await plumbing.execute({ args: ['config', 'user.email', 'stunt@example.com'] });

  const graph = new EmptyGraph({ plumbing });
  await fastGenerate(tempDir, nodeCount);
  const lastSha = (await plumbing.execute({ args: ['rev-parse', 'main'] })).trim();

  // O(N) Scan (Sample first 5000)
  const scanLimit = Math.min(nodeCount, 5000);
  const scanStart = performance.now();
  let _count = 0;
  for await (const _node of graph.service.iterateNodes({ ref: lastSha, limit: scanLimit })) {
    _count++;
  }
  const scanTime = (performance.now() - scanStart);
  const totalScanTime = (scanTime / scanLimit) * nodeCount;

  // Build Index
  const buildStart = performance.now();
  const treeOid = await graph.rebuildIndex(lastSha);
  const buildTime = performance.now() - buildStart;

  // Cold Load
  const coldLoadStart = performance.now();
  const indexCold = await graph.rebuildService.load(treeOid);
  const coldLoadTime = performance.now() - coldLoadStart;

  // Hot Lookup
  const hotLookupStart = performance.now();
  indexCold.getId(lastSha);
  const hotLookupTime = performance.now() - hotLookupStart;

  rmSync(tempDir, { recursive: true, force: true });

  return { nodeCount, scanTimeMs: totalScanTime, buildTimeMs: buildTime, loadTimeMs: coldLoadTime, lookupTimeMs: hotLookupTime };
}

async function main() {
  if (process.env.GIT_STUNTS_DOCKER !== '1') {
    process.exit(1);
  }

  const scales = [1000, 5000, 10000, 20000, 35000, 50000, 75000, 100000];
  const results = [];

  for (const scale of scales) {
    process.stdout.write(`Sampling @ ${scale} nodes... `);
    results.push(await runBenchmark(scale));
    console.log('DONE');
  }

  const last = results[results.length - 1];
  results.push({
    nodeCount: 1000000,
    scanTimeMs: (last.scanTimeMs / last.nodeCount) * 1000000,
    buildTimeMs: (last.buildTimeMs / last.nodeCount) * 1000000,
    loadTimeMs: last.loadTimeMs,
    lookupTimeMs: last.lookupTimeMs
  });

  const resultsPath = path.join(process.cwd(), 'benchmarks/results.json');
  writeFileSync(resultsPath, JSON.stringify(results, null, 2));
}

main().catch(console.error);
