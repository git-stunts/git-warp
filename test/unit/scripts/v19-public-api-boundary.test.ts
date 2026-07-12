import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = new URL('../../../', import.meta.url);

const ROOT_VALUE_EXPORTS = ['intent', 'openWarp', 'reading'] as const;

const ROOT_TYPE_EXPORTS = [
  'DraftTimeline',
  'EdgeIntentFields',
  'Intent',
  'IntentBuilders',
  'IntentDescriptor',
  'IntentKind',
  'JoinMode',
  'JoinOutcome',
  'JoinOptions',
  'JoinPolicy',
  'JoinReceipt',
  'JoinReceiptOptions',
  'JoinResult',
  'JoinResultOptions',
  'NeighborhoodReadingFields',
  'NodeIntentFields',
  'NodeReadingFields',
  'OpenWarpOptions',
  'PropertyIntentFields',
  'PropertyReadingFields',
  'ReadEvidence',
  'ReadOutcome',
  'ReadReceipt',
  'ReadReceiptOptions',
  'Reading',
  'ReadingBuilders',
  'ReadingDescriptor',
  'ReadingDirection',
  'ReadingKind',
  'ReadingResult',
  'ReadingResultOptions',
  'ReadingValue',
  'Receipt',
  'ReceiptOutcome',
  'RepairHint',
  'Tick',
  'Timeline',
  'TimelineView',
  'Warp',
  'StorageAdapter',
  'WriteReceipt',
  'WriteOutcome',
  'WriteReceiptOptions',
] as const;

type ModuleSurface = {
  readonly starExports: readonly string[];
  readonly typeExports: readonly string[];
  readonly valueExports: readonly string[];
};

function moduleSurface(relativePath = 'index.ts'): ModuleSurface {
  const source = readFileSync(new URL(relativePath, REPO_ROOT), 'utf8');
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const starExports: string[] = [];
  const typeExports: string[] = [];
  const valueExports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isExportDeclaration(statement)) {
      collectExportedDeclaration(statement, typeExports, valueExports);
      continue;
    }
    if (statement.exportClause === undefined) {
      starExports.push(statement.moduleSpecifier?.getText(sourceFile) ?? '<local>');
      continue;
    }
    if (!ts.isNamedExports(statement.exportClause)) {
      continue;
    }
    for (const element of statement.exportClause.elements) {
      const target = statement.isTypeOnly || element.isTypeOnly ? typeExports : valueExports;
      target.push(element.name.text);
    }
  }

  return {
    starExports: sorted(starExports),
    typeExports: sorted(typeExports),
    valueExports: sorted(valueExports),
  };
}

function collectExportedDeclaration(
  statement: ts.Statement,
  typeExports: string[],
  valueExports: string[]
): void {
  if (!hasExportModifier(statement)) {
    return;
  }
  if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) {
    typeExports.push(statement.name.text);
    return;
  }
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
    statement.name !== undefined
  ) {
    valueExports.push(statement.name.text);
    return;
  }
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        valueExports.push(declaration.name.text);
      }
    }
  }
}

function hasExportModifier(statement: ts.Statement): boolean {
  return (
    ts.canHaveModifiers(statement) &&
    ts
      .getModifiers(statement)
      ?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true
  );
}

function packageExportNames(relativePath: string): string[] {
  const value: unknown = JSON.parse(readFileSync(new URL(relativePath, REPO_ROOT), 'utf8'));
  if (!isRecord(value) || !isRecord(value['exports'])) {
    throw new Error(`${relativePath} must contain an exports object`);
  }
  return sorted(Object.keys(value['exports']));
}

function sorted(values: Iterable<string>): string[] {
  return Array.from(values).sort();
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('v19 public API boundary', () => {
  it('exports only the three first-use runtime values from package root', () => {
    const surface = moduleSurface();
    expect(surface.starExports).toEqual([]);
    expect(surface.valueExports).toEqual(sorted(ROOT_VALUE_EXPORTS));
  });

  it('locks the package-root companion types to an explicit contract', () => {
    expect(moduleSurface().typeExports).toEqual(sorted(ROOT_TYPE_EXPORTS));
  });

  it('keeps the storage subpath limited to application adapters', () => {
    const surface = moduleSurface('storage.ts');
    expect(surface.starExports).toEqual([]);
    expect(surface.valueExports).toEqual(['GitStorageAdapter', 'MemoryStorageAdapter']);
    expect(surface.typeExports).toEqual(['GitStorageAdapterOptions']);
  });

  it('keeps the advanced subpath limited to bounded coordinate reads', () => {
    const surface = moduleSurface('advanced.ts');
    expect(surface.starExports).toEqual([]);
    expect(surface.valueExports).toEqual(['Coordinate', 'Optic']);
    expect(surface.typeExports).toEqual(
      sorted([
        'NeighborhoodOpticCompleteness',
        'NeighborhoodOpticEdge',
        'NeighborhoodOpticReadDirection',
        'NeighborhoodOpticReadOptions',
        'ReadIdentityFrontierEntry',
        'ReadIdentityIndexShard',
        'ReadIdentityOptions',
        'ReadIdentityTailWitness',
        'WarpWorldlineCoordinateFrontierEntry',
        'Witness',
      ])
    );
  });

  it('keeps diagnostics usable from public receipt handles', () => {
    const surface = moduleSurface('diagnostics.ts');
    expect(surface.starExports).toEqual([]);
    expect(surface.valueExports).toEqual(['inspectReceipt']);
    expect(surface.typeExports).toEqual(['ReceiptInspection']);
  });

  it('publishes only the supported v19 subpaths', () => {
    expect(packageExportNames('package.json')).toEqual([
      '.',
      './advanced',
      './diagnostics',
      './package.json',
      './storage',
    ]);
    expect(packageExportNames('jsr.json')).toEqual([
      '.',
      './advanced',
      './diagnostics',
      './storage',
    ]);
  });
});
