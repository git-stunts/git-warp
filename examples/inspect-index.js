#!/usr/bin/env node
/**
 * Inspect WarpGraph Checkpoint Structure
 *
 * Visualizes the WARP checkpoint tree showing blob sizes and frontier info.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.WARPGRAPH_MODULE || path.resolve(__dirname, '..', 'index.js');
const resolvedModulePath = path.resolve(modulePath);
const moduleUrl = pathToFileURL(resolvedModulePath).href;
const { default: WarpGraph, GitGraphAdapter } = await import(moduleUrl);

const rootDir = path.dirname(resolvedModulePath);
const frontierUrl = pathToFileURL(path.join(rootDir, 'src/domain/services/Frontier.js')).href;
const { deserializeFrontier } = await import(frontierUrl);

const graphName = process.env.GRAPH_NAME || 'demo';
const writerId = process.env.WRITER_ID || 'inspector';
const createIfMissing = process.env.CREATE_CHECKPOINT === '1';

function formatBytes(bytes) {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`; }

async function main() {
  console.log('='.repeat(70));
  console.log('  WarpGraph Checkpoint Inspector');
  console.log('='.repeat(70));
  console.log('');

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const persistence = new GitGraphAdapter({ plumbing });

  const checkpointRef = `refs/empty-graph/${graphName}/checkpoints/head`;
  let checkpointSha = await persistence.readRef(checkpointRef);

  if (!checkpointSha && createIfMissing) {
    const graph = await WarpGraph.open({ persistence, graphName, writerId });
    await graph.materialize();
    checkpointSha = await graph.createCheckpoint();
  }

  if (!checkpointSha) {
    console.error(`No checkpoint found at ${checkpointRef}`);
    console.error('Run setup.js, then set CREATE_CHECKPOINT=1 to generate one.');
    process.exit(1);
  }

  console.log(`Checkpoint ref: ${checkpointRef}`);
  console.log(`Checkpoint SHA: ${checkpointSha}`);
  console.log('');

  const treeOids = await persistence.readTreeOids(checkpointSha);
  const paths = Object.keys(treeOids).sort();

  console.log('Checkpoint tree entries:');
  for (const pathName of paths) {
    const oid = treeOids[pathName];
    const buffer = await persistence.readBlob(oid);
    console.log(`  - ${pathName.padEnd(14)} ${formatBytes(buffer.length)}  ${oid}`);
  }

  if (treeOids['frontier.cbor']) {
    const frontierBuffer = await persistence.readBlob(treeOids['frontier.cbor']);
    const frontier = deserializeFrontier(frontierBuffer);
    const entries = Array.from(frontier.entries());

    console.log('\nFrontier writers:');
    if (entries.length === 0) {
      console.log('  (none)');
    } else {
      for (const [writer, sha] of entries) {
        console.log(`  - ${writer}: ${sha}`);
      }
    }
  }

  console.log('\nInspector complete.');
}

main().catch(err => {
  console.error('ERROR:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
