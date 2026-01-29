#!/usr/bin/env node
/**
 * Setup script for EmptyGraph demo
 *
 * Initializes a git repo and creates sample event data
 */

import { execSync } from 'child_process';
// Import from mounted volume in Docker
const modulePath = process.env.EMPTYGRAPH_MODULE || '/app/index.js';
const { default: EmptyGraph, ConsoleLogger, LogLevel } = await import(modulePath);
const { GitGraphAdapter } = await import(modulePath);
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';

// Demo should never hang indefinitely - 60s is generous for index build
const DEMO_TIMEOUT_MS = 60_000;

function createEvent(type, payload, correlationId = null) {
  return JSON.stringify({
    type,
    payload,
    correlationId,
    timestamp: new Date().toISOString(),
    version: 1,
  }, null, 2);
}

async function main() {
  console.log('🚀 EmptyGraph Demo Setup\n');

  // Initialize git repo if needed
  try {
    execSync('git rev-parse --git-dir', { stdio: 'pipe' });
    console.log('📁 Git repo already initialized');
  } catch {
    console.log('📁 Initializing git repo...');
    execSync('git init', { stdio: 'inherit' });
  }

  // Pre-flight check: detect if demo has already been run
  let existingMainRef = false;
  let existingCancelledRef = false;
  let existingIndexRef = false;

  try {
    execSync('git show-ref --verify refs/heads/main', { stdio: 'pipe' });
    existingMainRef = true;
  } catch {
    // ref doesn't exist
  }

  try {
    execSync('git show-ref --verify refs/heads/cancelled-order', { stdio: 'pipe' });
    existingCancelledRef = true;
  } catch {
    // ref doesn't exist
  }

  try {
    execSync('git show-ref --verify refs/empty-graph/index', { stdio: 'pipe' });
    existingIndexRef = true;
  } catch {
    // ref doesn't exist
  }

  if (existingMainRef || existingCancelledRef || existingIndexRef) {
    console.log('\n🔄 Existing demo data detected. Cleaning up...');

    if (existingMainRef) {
      execSync('git update-ref -d refs/heads/main', { stdio: 'pipe' });
      console.log('   Deleted refs/heads/main');
    }
    if (existingCancelledRef) {
      execSync('git update-ref -d refs/heads/cancelled-order', { stdio: 'pipe' });
      console.log('   Deleted refs/heads/cancelled-order');
    }
    if (existingIndexRef) {
      execSync('git update-ref -d refs/empty-graph/index', { stdio: 'pipe' });
      console.log('   Deleted refs/empty-graph/index');
    }

    console.log('   Cleanup complete. Starting fresh...\n');
  } else {
    console.log('\n✨ Fresh install detected. Proceeding with setup...\n');
  }

  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: process.cwd(), runner });
  const adapter = new GitGraphAdapter({ plumbing });
  const logger = new ConsoleLogger({ level: LogLevel.INFO });
  const graph = new EmptyGraph({ persistence: adapter, logger });

  console.log('\n📝 Creating sample events...\n');

  // Create a realistic event sequence for an e-commerce order
  const orderId = `order-${Date.now().toString(36)}`;
  const userId = 'user-alice-001';

  const events = [
    { type: 'UserCreated', payload: { userId, email: 'alice@example.com', name: 'Alice', metrics: { cpu: 1, mem: 2 } } },
    { type: 'CartCreated', payload: { userId, cartId: 'cart-001', metrics: { cpu: 1, mem: 1 } } },
    { type: 'ItemAddedToCart', payload: { cartId: 'cart-001', sku: 'WIDGET-001', qty: 2, price: 29.99, metrics: { cpu: 2, mem: 3 } } },
    { type: 'ItemAddedToCart', payload: { cartId: 'cart-001', sku: 'GADGET-002', qty: 1, price: 149.99, metrics: { cpu: 2, mem: 3 } } },
    { type: 'OrderPlaced', payload: { orderId, cartId: 'cart-001', total: 209.97, metrics: { cpu: 5, mem: 10 } } },
    { type: 'PaymentReceived', payload: { orderId, amount: 209.97, method: 'card', metrics: { cpu: 8, mem: 5 } } },
    { type: 'OrderShipped', payload: { orderId, carrier: 'FastShip', tracking: 'FS123456789', metrics: { cpu: 3, mem: 2 } } },
    { type: 'OrderDelivered', payload: { orderId, signature: 'A. Smith', metrics: { cpu: 1, mem: 1 } } },
  ];

  let parentSha = null;
  const shas = [];

  for (const { type, payload } of events) {
    const message = createEvent(type, payload, orderId);
    const sha = await graph.createNode({
      message,
      parents: parentSha ? [parentSha] : [],
    });
    shas.push({ sha, type });
    console.log(`  ✅ ${type.padEnd(20)} → ${sha.slice(0, 8)}`);
    parentSha = sha;
  }

  // Create a branch point - a cancelled order scenario
  console.log('\n🔀 Creating branch: cancelled-order scenario...\n');

  const branchPoint = shas[4].sha; // After OrderPlaced
  const cancelledSha = await graph.createNode({
    message: createEvent('OrderCancelled', { orderId, reason: 'Customer request', metrics: { cpu: 4, mem: 3 } }, orderId),
    parents: [branchPoint],
  });
  console.log(`  ✅ OrderCancelled       → ${cancelledSha.slice(0, 8)} (branched from OrderPlaced)`);

  // Update refs
  const refUpdates = [
    { cmd: `git update-ref refs/heads/main ${parentSha}`, desc: 'main ref' },
    { cmd: `git update-ref refs/heads/cancelled-order ${cancelledSha}`, desc: 'cancelled-order ref' },
    { cmd: 'git symbolic-ref HEAD refs/heads/main', desc: 'HEAD symbolic ref' },
  ];
  for (const { cmd, desc } of refUpdates) {
    try {
      execSync(cmd);
    } catch (err) {
      throw new Error(`Failed to update ${desc}: ${err.message}`);
    }
  }

  console.log('\n📊 Building bitmap index...\n');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEMO_TIMEOUT_MS);
  let indexOid;
  try {
    indexOid = await graph.rebuildIndex('main', { signal: controller.signal });
    await graph.saveIndex();
    console.log(`  Index saved to refs/empty-graph/index (${indexOid.slice(0, 8)})`);
  } finally {
    clearTimeout(timeout);
  }

  console.log('\n✅ Demo setup complete!\n');
  console.log('Try these commands:');
  console.log('  node explore.js          # Interactive exploration');
  console.log('  git log --oneline main   # See the event chain');
  console.log('  git log --oneline --all --graph  # See the branch');
  console.log('  cat .git/refs/empty-graph/index  # See the index ref');
  console.log('');
}

main().catch(err => {
  console.error('❌ Setup failed:', err.message);
  process.exit(1);
});
