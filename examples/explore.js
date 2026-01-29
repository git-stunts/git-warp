#!/usr/bin/env node
/**
 * Interactive EmptyGraph Explorer
 *
 * Run after setup.js to explore the event graph
 */

import { execSync } from 'child_process';
// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph } = await import(modulePath);
const { GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

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
