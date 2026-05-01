import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const COMPARISON_SELECTOR_PATH = 'src/domain/services/controllers/ComparisonSelector.ts';
const DESIGN_PATH = 'docs/design/0106-comparison-selector-live-coordinate-seam.md';
const STRAND_HELPER_MARKER = '/**\n * Assertion narrowing ComparisonHost';
const HOST_SEAM_TERMS = [
  'ComparisonHost',
  '_materializeCoordinateGraph',
  '_loadPatchChainFromSha',
  '_blobStorage',
  '_persistence',
] as const;
const REJECTED_SEAM_NAME_PATTERNS = [
  /\bRuntimePort\b/u,
  /\bRuntimeFacade\b/u,
  /\bGraphPort\b/u,
  /\bComparisonManager\b/u,
  /\bComparisonRuntimeManager\b/u,
  /\bComparisonHelper\b/u,
  new RegExp(`\\b[A-Za-z0-9_]+${'Like'}\\b`, 'u'),
];

function readRepoFile(path: string): string {
  return readFileSync(join(REPO_ROOT, path), 'utf8');
}

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);

  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);

  return source.slice(start, end);
}

function selectorClassSource(className: string, nextMarker: string): string {
  return sliceBetween(
    readRepoFile(COMPARISON_SELECTOR_PATH),
    `export class ${className}`,
    nextMarker,
  );
}

function liveCoordinateSeamSource(): string {
  return sliceBetween(
    readRepoFile(COMPARISON_SELECTOR_PATH),
    'export type ComparisonHost',
    STRAND_HELPER_MARKER,
  );
}

describe('comparison live/coordinate seam', () => {
  it('keeps this RED scoped away from strand selector implementation', () => {
    const scannedSource = liveCoordinateSeamSource();
    const fullSource = readRepoFile(COMPARISON_SELECTOR_PATH);
    const strandSource = sliceBetween(
      fullSource,
      'export class StrandComparisonSelector',
      '// ── Selector normalization',
    );

    expect(scannedSource).not.toContain('StrandComparisonSelector');
    expect(scannedSource).not.toContain('StrandBaseComparisonSelector');
    expect(strandSource).toContain('callInternalRuntimeMethod');
  });

  it('requires LiveComparisonSelector to depend on a narrow seam, not ComparisonHost', () => {
    const liveSelectorSource = selectorClassSource(
      'LiveComparisonSelector',
      'export class CoordinateComparisonSelector',
    );

    expect(liveSelectorSource).not.toContain('ComparisonHost');
    expect(liveSelectorSource).not.toContain('_materializeCoordinateGraph');
    expect(liveSelectorSource).not.toContain('_loadPatchChainFromSha');
    expect(liveSelectorSource).not.toContain('_blobStorage');
    expect(liveSelectorSource).not.toContain('_persistence');
  });

  it('requires CoordinateComparisonSelector to depend on a narrow seam, not ComparisonHost', () => {
    const coordinateSelectorSource = selectorClassSource(
      'CoordinateComparisonSelector',
      STRAND_HELPER_MARKER,
    );

    expect(coordinateSelectorSource).not.toContain('ComparisonHost');
    expect(coordinateSelectorSource).not.toContain('_materializeCoordinateGraph');
    expect(coordinateSelectorSource).not.toContain('_loadPatchChainFromSha');
    expect(coordinateSelectorSource).not.toContain('_blobStorage');
    expect(coordinateSelectorSource).not.toContain('_persistence');
  });

  it('rejects private runtime and storage seams from live/coordinate side resolution', () => {
    const source = liveCoordinateSeamSource();

    for (const term of HOST_SEAM_TERMS) {
      expect(source).not.toContain(term);
    }
  });

  it('rejects god-seam names for the comparison live/coordinate boundary', () => {
    const source = readRepoFile(COMPARISON_SELECTOR_PATH);

    for (const pattern of REJECTED_SEAM_NAME_PATTERNS) {
      expect(source).not.toMatch(pattern);
    }
  });

  it('keeps the existing controller test drift documented as evidence, not the RED', () => {
    const designSource = readRepoFile(DESIGN_PATH);

    expect(designSource).toContain('ComparisonController.test.ts');
    expect(designSource).toContain('not the RED for this cycle');
    expect(designSource).toContain('should not simply add `_materializeCoordinateGraph`');
  });

  it('records that RED is live/coordinate only and strand remains out of scope', () => {
    const designSource = readRepoFile(DESIGN_PATH);

    expect(designSource).toContain('live and coordinate selector resolution');
    expect(designSource).toContain('strand selector resolution');
    expect(designSource).toContain('Out of scope');
    expect(designSource).toContain('No whole-file demolition');
  });
});
