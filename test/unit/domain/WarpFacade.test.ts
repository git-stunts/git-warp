import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import {
  openWarp,
  Timeline,
  Warp,
} from '../../../index.ts';
import { OPEN_WARP_IDENTITY_FAILURE } from '../../../src/domain/api/OpenWarpIdentityFailure.ts';
import { MemoryStorageAdapter } from '../../../storage.ts';

function exportedNamesFor(path: string): ReadonlySet<string> {
  const sourceFile = sourceFileFor(path);
  const exportedNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    collectExportDeclarationNames(statement, exportedNames);
    collectExportedDeclarationName(statement, exportedNames);
  }

  return exportedNames;
}

function allDeclaredNamesFor(path: string): ReadonlySet<string> {
  const sourceFile = sourceFileFor(path);
  const declaredNames = new Set<string>();

  for (const statement of sourceFile.statements) {
    collectDeclaredStatementName(statement, declaredNames);
  }

  return declaredNames;
}

function sourceFileFor(path: string): ts.SourceFile {
  const sourceText = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  return ts.createSourceFile(
    path,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function collectExportDeclarationNames(statement: ts.Statement, exportedNames: Set<string>): void {
  if (!ts.isExportDeclaration(statement)) {
    return;
  }
  const exportClause = statement.exportClause;
  if (exportClause === undefined || !ts.isNamedExports(exportClause)) {
    return;
  }
  for (const element of exportClause.elements) {
    exportedNames.add(element.name.text);
  }
}

function collectDeclaredStatementName(statement: ts.Statement, declaredNames: Set<string>): void {
  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        declaredNames.add(declaration.name.text);
      }
    }
    return;
  }

  if (
    (ts.isClassDeclaration(statement)
      || ts.isFunctionDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement))
    && statement.name !== undefined
  ) {
    declaredNames.add(statement.name.text);
  }
}

function collectExportedDeclarationName(statement: ts.Statement, exportedNames: Set<string>): void {
  if (!ts.canHaveModifiers(statement)) {
    return;
  }
  const modifiers = ts.getModifiers(statement);
  if (modifiers === undefined || !modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)) {
    return;
  }

  if (ts.isVariableStatement(statement)) {
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name)) {
        exportedNames.add(declaration.name.text);
      }
    }
    return;
  }

  if (
    (ts.isClassDeclaration(statement)
      || ts.isFunctionDeclaration(statement)
      || ts.isInterfaceDeclaration(statement)
      || ts.isTypeAliasDeclaration(statement))
    && statement.name !== undefined
  ) {
    exportedNames.add(statement.name.text);
  }
}

describe('v19 Warp facade', () => {
  it('opens named timelines through root application nouns', async () => {
    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });

    const timeline = await warp.timeline('events');

    expect(warp).toBeInstanceOf(Warp);
    expect(Object.isFrozen(warp)).toBe(true);
    expect(warp.writer).toBe('agent-1');
    expect(timeline).toBeInstanceOf(Timeline);
    expect(Object.isFrozen(timeline)).toBe(true);
    expect(timeline.name).toBe('events');
    expect(timeline.writer).toBe('agent-1');
  });

  it('keeps the v19 facade off the browser root', () => {
    const browserExports = exportedNamesFor('browser.ts');

    expect(browserExports.has('openWarp')).toBe(false);
    expect(browserExports.has('Warp')).toBe(false);
    expect(browserExports.has('Timeline')).toBe(false);
    expect(browserExports.has('OpenWarpOptions')).toBe(false);
    expect(browserExports.has('WarpStorage')).toBe(false);
  });

  it('keeps internal history vocabulary off the public facade objects', async () => {
    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });
    const timeline = await warp.timeline('events');

    expect('worldlineName' in timeline).toBe(false);
    expect('writerId' in timeline).toBe(false);
    expect('commit' in timeline).toBe(false);
    expect('live' in timeline).toBe(false);
    expect('optic' in timeline).toBe(false);
  });

  it('keeps worldline openers off the root export surface', async () => {
    const rootModule = await import('../../../index.ts');

    expect('openWarpWorldline' in rootModule).toBe(false);
  });

  it('rejects missing storage and blank identities', async () => {
    await expect(openWarp({
      // @ts-expect-error runtime validation accepts JavaScript callers.
      storage: null,
      writer: 'agent-1',
    })).rejects.toThrow('openWarp requires storage');

    await expect(openWarp({
      storage: new MemoryStorageAdapter(),
      writer: '   ',
    })).rejects.toThrow('openWarp requires non-empty identity fields');

    const warp = await openWarp({
      storage: new MemoryStorageAdapter(),
      writer: 'agent-1',
    });

    await expect(warp.timeline('')).rejects.toThrow('openWarp requires non-empty identity fields');
  });

  it('names the openWarp identity failure payload once', () => {
    expect(OPEN_WARP_IDENTITY_FAILURE).toEqual({
      message: 'openWarp requires non-empty identity fields',
      code: 'E_OPEN_WARP_IDENTITY',
    });
  });

  it('keeps identity validation in the dedicated validator module', () => {
    const warpNames = allDeclaredNamesFor('src/domain/api/Warp.ts');
    const timelineNames = allDeclaredNamesFor('src/domain/api/Timeline.ts');
    const validatorExports = exportedNamesFor('src/domain/api/assertIdentity.ts');

    expect(warpNames.has('assertNonEmpty')).toBe(false);
    expect(timelineNames.has('assertTimelineIdentity')).toBe(false);
    expect(validatorExports.has('assertIdentity')).toBe(true);
  });

  it('rejects invalid public facade constructor options with domain errors', () => {
    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp(null);
    }).toThrow('Warp requires construction options');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Warp({ writer: 'agent-1' });
    }).toThrow('Warp requires an openTimeline function');

    expect(() => {
      // @ts-expect-error runtime validation accepts JavaScript callers.
      new Timeline(null);
    }).toThrow('Timeline requires construction options');
  });
});
