import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const header = [
  'api',
  'surface',
  'label',
  'provider',
  'first_use_docs',
  'notes',
  'issue',
] as const;

const validLabels = [
  'bounded',
  'streaming',
  'cursor',
  'transitional',
  'diagnostic',
  'offline',
  'legacy',
] as const;

type CostLabel = typeof validLabels[number];

type CostInventoryRow = {
  readonly api: string;
  readonly surface: string;
  readonly label: string;
  readonly provider: string;
  readonly firstUseDocs: string;
  readonly notes: string;
  readonly issue: string;
};

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

function inventoryRows(): readonly CostInventoryRow[] {
  const source = readRepoFile('docs/public-api-cost-inventory.tsv').trim();
  const lines = source.split('\n');
  expect(lines[0]?.split('\t')).toEqual([...header]);
  return lines.slice(1).map((line) => {
    const fields = line.split('\t');
    expect(fields).toHaveLength(header.length);
    return {
      api: fields[0] ?? '',
      surface: fields[1] ?? '',
      label: fields[2] ?? '',
      provider: fields[3] ?? '',
      firstUseDocs: fields[4] ?? '',
      notes: fields[5] ?? '',
      issue: fields[6] ?? '',
    };
  });
}

function findApi(rows: readonly CostInventoryRow[], api: string): CostInventoryRow {
  const row = rows.find((candidate) => candidate.api === api);
  if (row === undefined) {
    throw new Error(`Missing public API cost inventory row for ${api}`);
  }
  return row;
}

function isCostLabel(value: string): value is CostLabel {
  return validLabels.some((label) => label === value);
}

describe('public API cost inventory', () => {
  it('classifies required v18 public surfaces with valid labels', () => {
    const rows = inventoryRows();
    const requiredApis = [
      'openWarpWorldline()',
      'worldline.prepareOpticBasis()',
      'worldline.coordinate()',
      'coordinate.optic().node(id).read()',
      'coordinate.optic().node(id).prop(key).read()',
      'worldline.optic()',
      'worldline.live().getNodeProps(id)',
      'worldline.live().getNodes()',
      'worldline.query().run()',
      'graph.materialize()',
      'graph.getStateSnapshot()',
      'graph.getContentStream(id)',
      'graph.syncWith()',
      'graph.syncWith({ materialize: true })',
      'openWarpGraph()',
      'WarpApp.open()',
      'WarpCore.open()',
    ] as const;

    for (const api of requiredApis) {
      const row = findApi(rows, api);
      expect(isCostLabel(row.label)).toBe(true);
      expect(row.issue).toMatch(/^https:\/\/github\.com\/git-stunts\/git-warp\/issues\/\d+$/u);
    }
  });

  it('allows first-use docs only for bounded, streaming, or cursor rows', () => {
    const rows = inventoryRows();
    for (const row of rows) {
      if (row.firstUseDocs === 'yes') {
        expect(['bounded', 'streaming', 'cursor']).toContain(row.label);
      }
    }
  });

  it('states the gate-1 Optics setup truth', () => {
    const rows = inventoryRows();
    const prepare = findApi(rows, 'worldline.prepareOpticBasis()');
    expect(prepare.label).toBe('bounded');
    expect(prepare.provider).toContain('basis verifier');
    expect(prepare.notes).toContain('fails closed');

    const materialize = findApi(rows, 'graph.materialize()');
    expect(materialize.label).toBe('diagnostic');
    expect(materialize.firstUseDocs).toBe('no');
  });

  it('keeps first-use docs linked to cost labels and off old basis wording', () => {
    const readme = readRepoFile('README.md');
    const docsIndex = readRepoFile('docs/README.md');
    const apiReference = readRepoFile('docs/API_REFERENCE.md');
    const readings = readRepoFile('docs/READINGS_AND_OPTICS.md');
    const migration = readRepoFile('docs/migrations/v18.0.0.md');

    expect(readme).toContain('PUBLIC_API_COSTS.md');
    expect(docsIndex).toContain('PUBLIC_API_COSTS.md');
    expect(apiReference).toContain('does not create that basis by materializing the full graph');
    expect(readings).toContain('does not create that evidence by materializing the full graph');
    expect(migration).toContain('does not materialize the full graph to manufacture a basis');

    expect(readme).not.toContain('Creates the checkpoint-tail evidence');
    expect(apiReference).not.toContain('may perform runtime folding internally');
    expect(readings).not.toContain('call `prepareOpticBasis()` before capturing the coordinate');
  });
});
