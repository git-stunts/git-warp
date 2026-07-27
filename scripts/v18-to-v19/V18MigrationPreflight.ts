import { statfs } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { v18MigrationGitText } from './V18MigrationGit.ts';

const KIBIBYTE = 1_024n;
const OBJECT_BYTES_MULTIPLIER = 4n;

export type V18MigrationPreflight = Readonly<{
  repositoryObjectBytes: bigint;
  repositoryObjectCount: bigint;
  scratchAvailableBytes: bigint;
  scratchMinimumBytes: bigint;
  scratchPath: string;
  scratchSufficient: boolean;
  sourceAvailableBytes: bigint;
  sourceGitDirectory: string;
}>;

export async function inspectV18MigrationPreflight(options: {
  readonly repositoryPath: string;
  readonly scratchRoot?: string;
}): Promise<V18MigrationPreflight> {
  const scratchPath = resolve(options.scratchRoot ?? tmpdir());
  const [countObjects, sourceGitDirectory] = await Promise.all([
    v18MigrationGitText(options.repositoryPath, ['count-objects', '-v']),
    v18MigrationGitText(options.repositoryPath, ['rev-parse', '--absolute-git-dir']),
  ]);
  const [scratchFileSystem, sourceFileSystem] = await Promise.all([
    statfs(scratchPath, { bigint: true }),
    statfs(sourceGitDirectory, { bigint: true }),
  ]);
  const repositoryObjectBytes = parseV18MigrationObjectBytes(countObjects);
  const repositoryObjectCount = parseV18MigrationObjectCount(countObjects);
  const scratchMinimumBytes = estimateV18MigrationScratchBytes({
    repositoryObjectBytes,
    repositoryObjectCount,
    scratchBlockBytes: scratchFileSystem.bsize,
  });
  const scratchAvailableBytes = scratchFileSystem.bavail * scratchFileSystem.bsize;
  const sourceAvailableBytes = sourceFileSystem.bavail * sourceFileSystem.bsize;
  return Object.freeze({
    repositoryObjectBytes,
    repositoryObjectCount,
    scratchAvailableBytes,
    scratchMinimumBytes,
    scratchPath,
    scratchSufficient: scratchAvailableBytes >= scratchMinimumBytes,
    sourceAvailableBytes,
    sourceGitDirectory,
  });
}

export function parseV18MigrationObjectCount(output: string): bigint {
  const fields = parseCountObjectsFields(output);
  return integer(fields, 'count') + integer(fields, 'in-pack');
}

export function parseV18MigrationObjectBytes(output: string): bigint {
  const fields = parseCountObjectsFields(output);
  return (
    kibibytes(fields, 'size') + kibibytes(fields, 'size-pack') + kibibytes(fields, 'size-garbage')
  );
}

export function estimateV18MigrationScratchBytes(options: {
  readonly repositoryObjectBytes: bigint;
  readonly repositoryObjectCount: bigint;
  readonly scratchBlockBytes: bigint;
}): bigint {
  const byteVolumeBudget = options.repositoryObjectBytes * OBJECT_BYTES_MULTIPLIER;
  const looseObjectBudget =
    options.repositoryObjectBytes + options.repositoryObjectCount * options.scratchBlockBytes;
  return byteVolumeBudget > looseObjectBudget ? byteVolumeBudget : looseObjectBudget;
}

export function formatV18MigrationBytes(bytes: bigint): string {
  const units = [
    { name: 'TiB', size: 1_099_511_627_776n },
    { name: 'GiB', size: 1_073_741_824n },
    { name: 'MiB', size: 1_048_576n },
    { name: 'KiB', size: KIBIBYTE },
  ] as const;
  const unit = units.find((candidate) => bytes >= candidate.size);
  if (unit === undefined) {
    return `${String(bytes)} B`;
  }
  const tenths = (bytes * 10n + unit.size / 2n) / unit.size;
  return `${String(tenths / 10n)}.${String(tenths % 10n)} ${unit.name}`;
}

export function formatV18MigrationPreflight(preflight: V18MigrationPreflight): string {
  const posture = preflight.scratchSufficient ? 'sufficient' : 'BELOW OPERATING BUDGET';
  return [
    `Git object storage: ${formatV18MigrationBytes(preflight.repositoryObjectBytes)} across ${String(preflight.repositoryObjectCount)} objects`,
    `Scratch volume: ${preflight.scratchPath}`,
    `Scratch operating budget: ${formatV18MigrationBytes(preflight.scratchMinimumBytes)} minimum (byte volume and loose-object allocation)`,
    `Scratch free: ${formatV18MigrationBytes(preflight.scratchAvailableBytes)} (${posture})`,
    `Source Git free: ${formatV18MigrationBytes(preflight.sourceAvailableBytes)}`,
  ].join('\n');
}

function parseCountObjectsFields(output: string): ReadonlyMap<string, string> {
  return new Map(
    output
      .split('\n')
      .map((line) => line.split(':', 2).map((part) => part.trim()))
      .filter((parts): parts is [string, string] => parts.length === 2)
  );
}

function integer(fields: ReadonlyMap<string, string>, name: string): bigint {
  const value = fields.get(name);
  if (value === undefined || !/^(?:0|[1-9]\d*)$/u.test(value)) {
    throw new Error(`git count-objects did not report a valid ${name}: ${String(value)}`);
  }
  return BigInt(value);
}

function kibibytes(fields: ReadonlyMap<string, string>, name: string): bigint {
  return integer(fields, name) * KIBIBYTE;
}
