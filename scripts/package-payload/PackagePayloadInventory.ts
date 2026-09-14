import type PackagePayloadEntry from './PackagePayloadEntry.ts';
import PackagePayloadError from './PackagePayloadError.ts';

export default class PackagePayloadInventory {
  readonly packedBytes: number;
  readonly unpackedBytes: number;
  readonly entryCount: number;
  readonly entries: readonly PackagePayloadEntry[];

  constructor(packedBytes: number, unpackedBytes: number, entries: readonly PackagePayloadEntry[]) {
    assertNonNegativeSafeInteger('compressed size', packedBytes);
    assertNonNegativeSafeInteger('unpacked size', unpackedBytes);
    const retainedEntries = Object.freeze([...entries]);
    if (unpackedBytes !== sumEntryBytes(retainedEntries)) {
      throw new PackagePayloadError('npm unpacked size does not match its file inventory');
    }
    assertUniquePaths(retainedEntries);
    this.packedBytes = packedBytes;
    this.unpackedBytes = unpackedBytes;
    this.entryCount = retainedEntries.length;
    this.entries = retainedEntries;
    Object.freeze(this);
  }
}

function assertNonNegativeSafeInteger(name: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PackagePayloadError(`npm ${name} is invalid`);
  }
}

function sumEntryBytes(entries: readonly PackagePayloadEntry[]): number {
  return entries.reduce((total, entry) => total + entry.size, 0);
}

function assertUniquePaths(entries: readonly PackagePayloadEntry[]): void {
  const paths = new Set<string>();
  for (const entry of entries) {
    if (paths.has(entry.path)) {
      throw new PackagePayloadError(`npm inventory repeats path: ${entry.path}`);
    }
    paths.add(entry.path);
  }
}
