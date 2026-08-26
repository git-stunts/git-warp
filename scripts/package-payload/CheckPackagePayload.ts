#!/usr/bin/env node
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

import { formatFailure } from '../formatFailure.ts';
import PackagePayloadError from './PackagePayloadError.ts';
import type PackagePayloadInventory from './PackagePayloadInventory.ts';
import PackagePayloadPolicy from './PackagePayloadPolicy.ts';
import { decodeNpmPackInventory } from './adapters/NpmPackInventoryJsonAdapter.ts';

const PACK_TIMEOUT_MS = 120_000;
const DRY_RUN_ARGS = Object.freeze(['pack', '--dry-run', '--ignore-scripts', '--json']);

function main(argv: readonly string[]): void {
  const inventory = decodeNpmPackInventory(runNpmPack(npmPackArgs(argv)).stdout);
  const policy = new PackagePayloadPolicy();
  const assessment = policy.assess(inventory);
  if (!assessment.isAccepted()) {
    reportViolations(assessment.violations);
    process.exitCode = 1;
    return;
  }
  reportAccepted(inventory, policy);
}

function npmPackArgs(argv: readonly string[]): readonly string[] {
  if (argv.length === 0) {
    return DRY_RUN_ARGS;
  }
  const destination = parsePackDestination(argv);
  return Object.freeze(['pack', '--pack-destination', destination, '--ignore-scripts', '--json']);
}

function parsePackDestination(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--pack-destination') {
    throw new PackagePayloadError('usage: CheckPackagePayload.ts [--pack-destination DIR]');
  }
  const destination = argv[1];
  if (destination === undefined || destination.length === 0) {
    throw new PackagePayloadError('package destination must not be empty');
  }
  return destination;
}

function runNpmPack(args: readonly string[]): SpawnSyncReturns<string> {
  const result = spawnSync('npm', [...args], {
    encoding: 'utf8',
    timeout: PACK_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  if (result.error !== undefined) {
    throw new PackagePayloadError(`npm pack failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new PackagePayloadError(
      `npm pack exited ${String(result.status)}: ${result.stderr.trim()}`
    );
  }
  return result;
}

function reportViolations(violations: readonly string[]): void {
  for (const violation of violations) {
    process.stderr.write(`package-payload: ${violation}\n`);
  }
}

function reportAccepted(inventory: PackagePayloadInventory, policy: PackagePayloadPolicy): void {
  process.stdout.write('package-payload: PASS\n');
  process.stdout.write(
    `  compressed bytes: ${String(inventory.packedBytes)} / ${String(policy.maxPackedBytes)}\n`
  );
  process.stdout.write(
    `  unpacked bytes:   ${String(inventory.unpackedBytes)} / ${String(policy.maxUnpackedBytes)}\n`
  );
  process.stdout.write(
    `  entries:          ${String(inventory.entryCount)} / ${String(policy.maxEntryCount)}\n`
  );
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`package-payload: ${formatFailure(error)}\n`);
  process.exitCode = 1;
}
