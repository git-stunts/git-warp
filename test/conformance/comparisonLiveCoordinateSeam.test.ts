import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const COMPARISON_SELECTOR_PATH = 'src/domain/services/controllers/ComparisonSelector.ts';
const DESIGN_PATH = 'docs/design/0106-comparison-selector-live-coordinate-seam.md';
const STRAND_HELPER_MARKER = '/**\n * Assertion narrowing ComparisonHost';
const STRAND_COMPARISON_SELECTOR_MARKER = 'export class StrandComparisonSelector';
const STRAND_BASE_SELECTOR_MARKER = 'export class StrandBaseComparisonSelector';
const SELECTOR_NORMALIZATION_MARKER = '// ── Selector normalization';
const HOST_SEAM_TERMS = [
  'ComparisonHost',
  '_materializeCoordinateGraph',
  '_loadPatchChainFromSha',
  '_blobStorage',
  '_persistence',
] as const;
const STRAND_RUNTIME_TERMS = [
  'strandCoordinatorFor',
  'createStrandCoordinator',
  'callInternalRuntimeMethod',
  'materializeStrand',
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

function coordinateBackedSeamSource(): string {
  return [
    selectorClassSource('LiveComparisonSelector', 'export class CoordinateComparisonSelector'),
    selectorClassSource('CoordinateComparisonSelector', STRAND_HELPER_MARKER),
    selectorClassSource('StrandBaseComparisonSelector', SELECTOR_NORMALIZATION_MARKER),
  ].join('\n');
}

describe('comparison coordinate-backed side seam', () => {
  it('keeps this RED scoped away from full strand selector implementation', () => {
    const scannedSource = coordinateBackedSeamSource();
    const fullSource = readRepoFile(COMPARISON_SELECTOR_PATH);
    const strandSource = sliceBetween(
      fullSource,
      STRAND_COMPARISON_SELECTOR_MARKER,
      STRAND_BASE_SELECTOR_MARKER,
    );

    expect(scannedSource).not.toContain('StrandComparisonSelector');
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

  it('requires StrandBaseComparisonSelector to resolve base coordinates through a narrow seam', () => {
    const strandBaseSelectorSource = selectorClassSource(
      'StrandBaseComparisonSelector',
      SELECTOR_NORMALIZATION_MARKER,
    );

    expect(strandBaseSelectorSource).not.toContain('ComparisonHost');
    expect(strandBaseSelectorSource).not.toContain('_materializeCoordinateGraph');
    expect(strandBaseSelectorSource).not.toContain('_loadPatchChainFromSha');
    expect(strandBaseSelectorSource).not.toContain('_blobStorage');
    expect(strandBaseSelectorSource).not.toContain('_persistence');
    expect(strandBaseSelectorSource).not.toContain('strandCoordinatorFor');
    expect(strandBaseSelectorSource).not.toContain('callInternalRuntimeMethod');
    expect(strandBaseSelectorSource).not.toContain('materializeStrand');
  });

  it('rejects private runtime and storage seams from coordinate-backed side resolution', () => {
    const source = coordinateBackedSeamSource();

    for (const term of HOST_SEAM_TERMS) {
      expect(source).not.toContain(term);
    }
    for (const term of STRAND_RUNTIME_TERMS) {
      expect(source).not.toContain(term);
    }
  });

  it('rejects god-seam names for the comparison coordinate-backed boundary', () => {
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

  it('records that RED is coordinate-backed and full strand remains out of scope', () => {
    const designSource = readRepoFile(DESIGN_PATH);

    expect(designSource).toContain('coordinate-backed comparison side resolution');
    expect(designSource).toContain('StrandBaseComparisonSelector');
    expect(designSource).toContain('StrandComparisonSelector');
    expect(designSource).toContain('Out of scope');
    expect(designSource).toContain('No whole-file demolition');
  });
});
