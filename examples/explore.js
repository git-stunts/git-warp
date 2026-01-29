#!/usr/bin/env node
/**
 * Interactive EmptyGraph Explorer
 *
 * Run after setup.js to explore the event graph
 */

import { execSync, spawnSync } from 'child_process';
// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph } = await import(modulePath);
const { GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

/**
 * Format nanoseconds to appropriate units (ns, μs, ms)
 */
function formatTime(ns) {
  if (ns < 1000n) return `${ns}ns`;
  if (ns < 1000000n) return `${(Number(ns) / 1000).toFixed(2)}μs`;
  return `${(Number(ns) / 1000000).toFixed(2)}ms`;
}

/**
 * Measure execution time with nanosecond precision
 * @param {Function} fn - Function to measure (can be async)
 * @returns {Promise<{result: any, elapsed: bigint}>}
 */
async function measure(fn) {
  const start = process.hrtime.bigint();
  const result = await fn();
  const elapsed = process.hrtime.bigint() - start;
  return { result, elapsed };
}

async function main() {
  console.log('🔍 EmptyGraph Explorer\n');

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const adapter = new GitGraphAdapter({ plumbing });
  const graph = new EmptyGraph({ persistence: adapter });

  // Load the index
  const loaded = await graph.loadIndexFromRef();
  if (!loaded) {
    console.error('❌ No index found. Run setup.js first.');
    process.exit(1);
  }
  console.log('📊 Index loaded\n');

  // Get the head commit
  const headSha = execSync('git rev-parse main', { encoding: 'utf-8' }).trim();

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('1. REPLAY ALL EVENTS (ancestors of HEAD)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const events = [];
  for await (const node of graph.traversal.ancestors({ sha: headSha })) {
    const message = await graph.readNode(node.sha);
    const event = JSON.parse(message);
    events.push({ sha: node.sha, depth: node.depth, event });
  }

  // Reverse to show chronological order
  events.reverse();

  for (const { sha, event } of events) {
    console.log(`[${sha.slice(0, 8)}] ${event.type}`);
    console.log(`           ${JSON.stringify(event.payload)}\n`);
  }

  console.log('═══════════════════════════════════════════════════════════════');
  console.log('2. REBUILD STATE (event sourcing projection)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // Simple projection
  const state = { users: {}, carts: {}, orders: {} };

  for (const { event } of events) {
    switch (event.type) {
      case 'UserCreated':
        state.users[event.payload.userId] = {
          ...event.payload,
          createdAt: event.timestamp
        };
        break;
      case 'CartCreated':
        state.carts[event.payload.cartId] = {
          userId: event.payload.userId,
          items: []
        };
        break;
      case 'ItemAddedToCart':
        state.carts[event.payload.cartId]?.items.push({
          sku: event.payload.sku,
          qty: event.payload.qty,
          price: event.payload.price,
        });
        break;
      case 'OrderPlaced':
        state.orders[event.payload.orderId] = {
          cartId: event.payload.cartId,
          total: event.payload.total,
          status: 'placed',
        };
        break;
      case 'PaymentReceived':
        if (state.orders[event.payload.orderId]) {
          state.orders[event.payload.orderId].status = 'paid';
          state.orders[event.payload.orderId].payment = event.payload;
        }
        break;
      case 'OrderShipped':
        if (state.orders[event.payload.orderId]) {
          state.orders[event.payload.orderId].status = 'shipped';
          state.orders[event.payload.orderId].shipping = event.payload;
        }
        break;
      case 'OrderDelivered':
        if (state.orders[event.payload.orderId]) {
          state.orders[event.payload.orderId].status = 'delivered';
        }
        break;
    }
  }

  console.log('Projected state:');
  console.log(JSON.stringify(state, null, 2));

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('3. COMPARE BRANCHES (main vs cancelled-order)');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const cancelledSha = execSync('git rev-parse cancelled-order', { encoding: 'utf-8' }).trim();

  // Find common ancestor
  const mainAncestors = new Set();
  for await (const node of graph.traversal.ancestors({ sha: headSha })) {
    mainAncestors.add(node.sha);
  }

  let commonAncestor = null;
  for await (const node of graph.traversal.ancestors({ sha: cancelledSha })) {
    if (mainAncestors.has(node.sha)) {
      commonAncestor = node.sha;
      break;
    }
  }

  if (commonAncestor) {
    const commonEvent = JSON.parse(await graph.readNode(commonAncestor));
    console.log(`Branch point: [${commonAncestor.slice(0, 8)}] ${commonEvent.type}`);
    console.log('');
    console.log('Main branch continued with:');

    let foundBranch = false;
    for await (const node of graph.traversal.descendants({ sha: commonAncestor })) {
      if (node.sha === commonAncestor) continue;
      if (mainAncestors.has(node.sha)) {
        const evt = JSON.parse(await graph.readNode(node.sha));
        console.log(`  → ${evt.type}`);
      }
    }

    console.log('\nCancelled branch has:');
    const cancelledEvent = JSON.parse(await graph.readNode(cancelledSha));
    console.log(`  → ${cancelledEvent.type}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('4. PATH FINDING');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const firstSha = events[0].sha;
  const lastSha = events[events.length - 1].sha;

  const path = await graph.traversal.shortestPath({ from: firstSha, to: lastSha });
  console.log(`Shortest path from first to last event: ${path.length} hops`);
  console.log(`Path: ${path.path.map(s => s.slice(0, 8)).join(' → ')}`);

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('5. TOPOLOGICAL ORDER');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Events in dependency order:');
  let count = 0;
  for await (const node of graph.traversal.topologicalSort({ start: firstSha })) {
    const evt = JSON.parse(await graph.readNode(node.sha));
    console.log(`  ${++count}. ${evt.type}`);
    if (count >= 10) break;
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('6. PERFORMANCE COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════\n');

  console.log('Bitmap index O(1) lookups vs git log traversal:\n');

  // Pick a commit in the middle for testing
  const testSha = events[Math.floor(events.length / 2)]?.sha || headSha;

  // Single getParents() call
  const { elapsed: parentsTime } = await measure(async () => {
    return graph.getParents(testSha);
  });
  console.log(`  getParents() single lookup:   ${formatTime(parentsTime)}`);

  // Single getChildren() call
  const { elapsed: childrenTime } = await measure(async () => {
    return graph.getChildren(testSha);
  });
  console.log(`  getChildren() single lookup:  ${formatTime(childrenTime)}`);

  // Batch of 100 random lookups
  const sampleShas = events.map(e => e.sha);
  const batchSize = Math.min(100, sampleShas.length);
  const { elapsed: batchTime } = await measure(async () => {
    for (let i = 0; i < batchSize; i++) {
      const sha = sampleShas[i % sampleShas.length];
      await graph.getParents(sha);
      await graph.getChildren(sha);
    }
  });
  const avgPerLookup = batchTime / BigInt(batchSize * 2);
  console.log(`  Batch ${batchSize * 2} lookups:            ${formatTime(batchTime)} (avg: ${formatTime(avgPerLookup)}/lookup)`);

  // Compare to git log operation
  console.log('\n  Git log equivalent operations:');

  const { elapsed: gitParentsTime } = await measure(async () => {
    execSync(`git log --pretty=%P -n 1 ${testSha}`, { encoding: 'utf-8' });
  });
  console.log(`  git log --pretty=%P:          ${formatTime(gitParentsTime)}`);

  const { elapsed: gitChildrenTime } = await measure(async () => {
    // Finding children requires scanning the log
    try {
      execSync(`git rev-list --children --all | grep "^${testSha}"`, {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      // grep returns exit code 1 if no match, which is fine
    }
  });
  console.log(`  git rev-list --children:      ${formatTime(gitChildrenTime)}`);

  // Calculate speedup factors
  const parentsSpeedup = Number(gitParentsTime) / Number(parentsTime);
  const childrenSpeedup = Number(gitChildrenTime) / Number(childrenTime);

  console.log('\n  ┌─────────────────────────────────────────────────────────────┐');
  console.log('  │ SPEEDUP SUMMARY                                             │');
  console.log('  ├─────────────────────────────────────────────────────────────┤');
  console.log(`  │ getParents():   ${parentsSpeedup.toFixed(0).padStart(6)}x faster than git log               │`);
  console.log(`  │ getChildren():  ${childrenSpeedup.toFixed(0).padStart(6)}x faster than git rev-list         │`);
  console.log('  └─────────────────────────────────────────────────────────────┘');

  console.log('\n  Note: Bitmap index provides O(1) lookup via pre-computed');
  console.log('        parent/child mappings stored in the index blob.');

  console.log('\n✅ Exploration complete!\n');
  console.log('More things to try:');
  console.log('  git log --oneline --all --graph   # Visualize the DAG');
  console.log('  git show <sha>                    # View raw commit');
  console.log('  git cat-file -p <sha>             # Low-level commit data');
  console.log('');
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
