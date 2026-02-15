#!/usr/bin/env node
/**
 * WarpGraph Explorer
 *
 * Run after setup.js to explore the materialized graph state.
 */

import { execSync } from 'child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modulePath = process.env.WARPGRAPH_MODULE || path.resolve(__dirname, '..', 'index.js');
const resolvedModulePath = path.resolve(modulePath);
const moduleUrl = pathToFileURL(resolvedModulePath).href;
const { default: WarpGraph, GitGraphAdapter } = await import(moduleUrl);

const graphName = process.env.GRAPH_NAME || 'demo';
const writerId = process.env.WRITER_ID || 'explorer';

function mapToObject(map) {
  const obj = {};
  for (const [key, value] of map.entries()) {
    obj[key] = value;
  }
  return obj;
}

async function main() {
  console.log('🔍 WarpGraph Explorer\n');

  // Ensure git repo exists
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
  } catch {
    console.error('No git repo found. Run setup.js first to initialize.');
    process.exit(1);
  }

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const persistence = new GitGraphAdapter({ plumbing });
  const graph = await WarpGraph.open({
    persistence,
    graphName,
    writerId,
  });

  console.log(`[1] Opened graph: "${graph.graphName}" as writer: "${graph.writerId}"`);

  const state = await graph.materialize();
  console.log('[2] Materialized state');
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  console.log(`    Nodes: ${nodes.length}`);
  console.log(`    Edges: ${edges.length}`);
  console.log(`    Properties: ${state.prop.size}`);

  console.log('\n[3] Nodes and properties:');
  const sortedNodes = nodes.slice().sort();
  if (sortedNodes.length === 0) {
    console.log('    No nodes found. Run setup.js to create demo data.');
    return;
  }

  for (const nodeId of sortedNodes) {
    const props = await graph.getNodeProps(nodeId);
    const printable = props ? mapToObject(props) : {};
    console.log(`  - ${nodeId}`);
    if (Object.keys(printable).length > 0) {
      console.log(`      props: ${JSON.stringify(printable)}`);
    }
  }

  console.log('\n[4] Edges:');
  if (edges.length === 0) {
    console.log('    No edges found.');
  } else {
    for (const edge of edges) {
      console.log(`  - ${edge.from} --${edge.label}--> ${edge.to}`);
    }
  }

  console.log('\n[5] Neighborhood example (user:alice):');
  if (graph.hasNode('user:alice')) {
    const neighbors = graph.neighbors('user:alice', 'both');
    for (const neighbor of neighbors) {
      console.log(`  - ${neighbor.direction}: ${neighbor.label} -> ${neighbor.nodeId}`);
    }
  } else {
    console.log('    user:alice not found in this graph.');
  }

  console.log('\n[6] Writers & frontier:');
  const writers = await graph.discoverWriters();
  console.log(`    Writers: [${writers.join(', ')}]`);

  const frontier = await graph.getFrontier();
  const frontierObj = mapToObject(frontier);
  console.log(`    Frontier: ${JSON.stringify(frontierObj)}`);

  console.log('\nExplorer complete!');
}

main().catch(err => {
  console.error('Error:', err.message);
  if (err.stack) {
    console.error(err.stack);
  }
  process.exit(1);
});
