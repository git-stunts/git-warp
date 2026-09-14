import { z } from 'zod';

import PackagePayloadEntry from '../PackagePayloadEntry.ts';
import PackagePayloadError from '../PackagePayloadError.ts';
import PackagePayloadInventory from '../PackagePayloadInventory.ts';

const FILE_SCHEMA = z.object({
  path: z.string().min(1),
  size: z.number().int().nonnegative(),
});

const ARTIFACT_SCHEMA = z.object({
  size: z.number().int().nonnegative(),
  unpackedSize: z.number().int().nonnegative(),
  entryCount: z.number().int().nonnegative(),
  files: z.array(FILE_SCHEMA),
});

const INVENTORY_SCHEMA = z.tuple([ARTIFACT_SCHEMA]);

export function decodeNpmPackInventory(json: string): PackagePayloadInventory {
  const decoded = parseNpmPackJson(json);
  const [artifact] = INVENTORY_SCHEMA.parse(decoded);
  if (artifact.entryCount !== artifact.files.length) {
    throw new PackagePayloadError('npm entry count does not match its file inventory');
  }
  const entries = artifact.files.map((file) => new PackagePayloadEntry(file.path, file.size));
  return new PackagePayloadInventory(artifact.size, artifact.unpackedSize, entries);
}

function parseNpmPackJson(output: string): unknown {
  const trimmedOutput = output.trim();
  try {
    return JSON.parse(trimmedOutput);
  } catch {
    return parseTerminalJsonArray(trimmedOutput);
  }
}

function parseTerminalJsonArray(output: string): unknown {
  const starts = [...output.matchAll(/(?:^|\n)(?=\[)/gu)].map((match) =>
    match.index + (match[0] === '\n' ? 1 : 0)
  );
  for (const start of starts.toReversed()) {
    try {
      return JSON.parse(output.slice(start));
    } catch {
      continue;
    }
  }
  throw new PackagePayloadError('npm pack did not return valid JSON');
}
