import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { extractJsExports, parseExportBlock } from '../../../scripts/check-dts-surface.ts';

const REPO_ROOT = new URL('../../../', import.meta.url);

const ROOT_ERROR_ALLOWLIST = new Set<string>([
  'PatchError',
  'QueryError',
  'StrandError',
  'WormholeError',
]);

const GRAPH_SUBSTRATE_NOUNS = new Set<string>([
  'BitmapIndexBuilder',
  'BitmapIndexReader',
  'BlobStoragePort',
  'ContentAttachmentProjection',
  'EdgeId',
  'EdgePropertyWriteIntent',
  'EdgeRecord',
  'EdgeTypeId',
  'IndexRebuildService',
  'InMemoryBlobStorageAdapter',
  'LegacyEdgePropertyKey',
  'LegacyNodePropertyKey',
  'LegacyPropertyProjection',
  'LegacyPropertyValue',
  'NodeId',
  'NodePropertyWriteIntent',
  'NodeRecord',
  'NodeTypeId',
  'VisibleEdgePropertyRecord',
  'VisibleNodePropertyRecord',
]);

function collectSourceExports(relativePath: string): string[] {
  return sorted(collectSourceExportsFrom(new URL(relativePath, REPO_ROOT), new Set<string>()));
}

function collectSourceExportsFrom(sourceUrl: URL, visited: Set<string>): Set<string> {
  const visitKey = sourceUrl.href;
  if (visited.has(visitKey)) {
    return new Set<string>();
  }
  visited.add(visitKey);

  const source = readFileSync(sourceUrl, 'utf8');
  const names = extractJsExports(source);
  for (const match of source.matchAll(/export\s+type\s*\{([^}]+)\}/g)) {
    for (const name of parseExportBlock(match[1] ?? '')) {
      names.add(name);
    }
  }
  for (const match of source.matchAll(/export\s+\*\s+from\s+['"]([^'"]+)['"]/g)) {
    const specifier = match[1];
    if (specifier !== undefined) {
      for (const name of collectSourceExportsFrom(new URL(specifier, sourceUrl), visited)) {
        names.add(name);
      }
    }
  }
  return names;
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
}

function hasForbiddenVocabulary(name: string): boolean {
  if (ROOT_ERROR_ALLOWLIST.has(name)) {
    return false;
  }

  return (
    name.includes('Graph') ||
    name.includes('Worldline') ||
    name.includes('Strand') ||
    name.includes('Optic') ||
    name.includes('Hologram') ||
    name.includes('Witness') ||
    name.includes('Braid') ||
    name.includes('Wormhole') ||
    name.includes('Projection') ||
    name.includes('Observer') ||
    name.includes('Query') ||
    name.includes('Coordinate') ||
    name.includes('Selector') ||
    name === 'WarpApp' ||
    name === 'WarpCore' ||
    name === 'PatchBuilder' ||
    name === 'PatchSession' ||
    name.startsWith('createNode') ||
    name.startsWith('createEdge') ||
    name.startsWith('createProp') ||
    name === 'createInlineValue' ||
    name === 'createBlobValue' ||
    name === 'decodeEdgePropKey' ||
    name === 'encodeEdgePropKey' ||
    name === 'isEdgePropKey' ||
    GRAPH_SUBSTRATE_NOUNS.has(name)
  );
}

function forbiddenExportsFrom(exportNames: readonly string[]): string[] {
  return sorted(exportNames.filter((name) => hasForbiddenVocabulary(name)));
}

function packageExportNames(relativePath: string): string[] {
  const value: unknown = JSON.parse(readFileSync(new URL(relativePath, REPO_ROOT), 'utf8'));
  if (!isRecord(value) || !isRecord(value['exports'])) {
    throw new Error(`${relativePath} must contain an exports object`);
  }
  return sorted(Object.keys(value['exports']));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('v19 public API boundary', () => {
  it('keeps graph, optic, worldline, witness, and diagnostic nouns out of package root', () => {
    expect(forbiddenExportsFrom(collectSourceExports('index.ts'))).toEqual([]);
  });

  it('does not publish retired browser or legacy compatibility entrypoints', () => {
    expect(packageExportNames('package.json')).not.toContain('./browser');
    expect(packageExportNames('package.json')).not.toContain('./legacy');
    expect(packageExportNames('jsr.json')).not.toContain('./browser');
    expect(packageExportNames('jsr.json')).not.toContain('./legacy');
  });
});
