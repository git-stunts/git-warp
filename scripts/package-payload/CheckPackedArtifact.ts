#!/usr/bin/env node
// Assertions the packed-artifact smoke runs against an installed tarball. It
// reads the installed package by path and never imports it by package name,
// so nothing here resolves back into the checkout.
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';

import { formatFailure } from '../formatFailure.ts';
import PackagePayloadError from './PackagePayloadError.ts';
import { findEscapingDocumentLinks, findUnresolvedImports } from './PackedArtifactFiles.ts';

const boundary = new PackedArtifactBoundaryAdapter();
const PACKAGE_METADATA = z.object({ version: z.string().min(1) });
const WRITE_RESULT = z.object({
  lane: z.literal('events'),
  intent: z.object({ kind: z.literal('property.set') }),
});
const OBSERVATION = z.object({ readings: z.array(z.object({ value: z.string() })).min(1) });
const DOCTOR_REPORT = z.object({
  findings: z.array(
    z.object({ id: z.string(), code: z.string(), status: z.enum(['ok', 'warn', 'fail']) })
  ),
});
const UPGRADE_REPORT = z.object({
  dryRun: z.literal(true),
  graphs: z.array(z.object({ graphName: z.string(), checkpoint: z.object({ status: z.string() }) })),
});

const COMMANDS = Object.freeze({ documents, imports, hook, results });

async function main(argv: readonly string[]): Promise<void> {
  const name = argv[0] ?? '';
  if (!isCommand(name)) {
    throw new PackagePayloadError('usage: CheckPackedArtifact.ts documents|imports|hook|results ...');
  }
  await COMMANDS[name](argv.slice(1));
  process.stdout.write(`packed-artifact: ${name} PASS\n`);
}

function isCommand(name: string): name is keyof typeof COMMANDS {
  return Object.hasOwn(COMMANDS, name);
}

function argument(args: readonly string[], index: number): string {
  const value = args[index];
  if (value === undefined || value.length === 0) {
    throw new PackagePayloadError(`missing argument ${String(index + 1)}`);
  }
  return value;
}

function requireEmpty(label: string, problems: readonly string[]): void {
  if (problems.length > 0) {
    throw new PackagePayloadError(`${label} escape the artifact:\n${problems.join('\n')}`);
  }
}

/** Shipped documents link package-relative only to shipped files. */
function documents(args: readonly string[]): Promise<void> {
  requireEmpty('shipped document links', findEscapingDocumentLinks(argument(args, 0)));
  return Promise.resolve();
}

/** Every relative import in the shipped JavaScript resolves inside the artifact. */
function imports(args: readonly string[]): Promise<void> {
  requireEmpty('shipped relative imports', findUnresolvedImports(argument(args, 0)));
  return Promise.resolve();
}

/** Installs the post-merge hook through the packaged CLI wiring into a repository. */
async function hook(args: readonly string[]): Promise<void> {
  const packageDir = argument(args, 0);
  const repo = argument(args, 1);
  const hooksDir = join(repo, '.git', 'hooks');
  await boundary.installHook(packageDir, repo);
  requireStampedExecutableHook(packageDir, join(hooksDir, 'post-merge'));
}

function requireStampedExecutableHook(packageDir: string, hookPath: string): void {
  const { version } = boundary.read(join(packageDir, 'package.json'), PACKAGE_METADATA);
  if (!readFileSync(hookPath, 'utf8').includes(`# warp-hook-version: ${version}`)) {
    throw new PackagePayloadError('installed hook was not stamped from the shipped template');
  }
  if ((statSync(hookPath).mode & 0o111) === 0) {
    throw new PackagePayloadError('installed post-merge hook is not executable');
  }
}

/** Validates the JSON the smoke captured from the packaged CLI and migrations. */
function results(args: readonly string[]): Promise<void> {
  const workDir = argument(args, 0);
  boundary.read(join(workDir, 'write.json'), WRITE_RESULT);
  const [reading] = boundary.read(join(workDir, 'observe.json'), OBSERVATION).readings;
  if (reading?.value !== 'admin') {
    throw new PackagePayloadError('git-warp observe did not read the written value');
  }
  requireHookFinding(join(workDir, 'doctor-before.json'), 'HOOKS_MISSING');
  requireHookFinding(join(workDir, 'doctor-after.json'), 'HOOKS_OK');
  const upgrade = boundary.read(join(workDir, 'upgrade.json'), UPGRADE_REPORT);
  const lane = upgrade.graphs.find((graph) => graph.graphName === 'events');
  if (lane?.checkpoint.status !== 'already-current') {
    throw new PackagePayloadError('legacy upgrade dry run did not classify the Lane as current');
  }
  return Promise.resolve();
}

function requireHookFinding(path: string, expectedCode: string): void {
  const { findings } = boundary.read(path, DOCTOR_REPORT);
  if (findings.some((finding) => finding.status === 'fail')) {
    throw new PackagePayloadError(`doctor reported failed checks in ${path}`);
  }
  const hookFinding = findings.find((finding) => finding.id === 'hooks-installed');
  if (hookFinding?.code !== expectedCode) {
    throw new PackagePayloadError(`doctor hook finding in ${path} is not ${expectedCode}`);
  }
}

main(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`packed-artifact: ${formatFailure(error)}\n`);
  process.exitCode = 1;
});
