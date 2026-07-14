import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { openMemoryWarpGraph as openWarpGraph } from '../../helpers/MemoryRuntimeHost.ts';
import { createInMemoryRepo } from '../../helpers/warpGraphTestUtils.ts';

type SourcePaths = {
  readonly warpGraph: string;
  readonly warpGraphBridge: string;
  readonly warpCore: string;
  readonly warpCoreProduct: string;
  readonly runtimeHostProduct: string;
  readonly runtimeHost: string;
  readonly runtimeHostBoot: string;
};

const sourcePaths: SourcePaths = Object.freeze({
  warpGraph: sourcePath('../../../src/domain/WarpGraph.ts'),
  warpGraphBridge: sourcePath('../../../src/domain/warp/WarpGraphRuntimeBridge.ts'),
  warpCore: sourcePath('../../../src/domain/WarpCore.ts'),
  warpCoreProduct: sourcePath('../../../src/domain/warp/WarpCoreRuntimeProduct.ts'),
  runtimeHostProduct: sourcePath('../../../src/domain/warp/RuntimeHostProduct.ts'),
  runtimeHost: sourcePath('../../../src/domain/RuntimeHost.ts'),
  runtimeHostBoot: sourcePath('../../../src/domain/warp/RuntimeHostBoot.ts'),
});

function sourcePath(relativeUrl: string): string {
  return fileURLToPath(new URL(relativeUrl, import.meta.url));
}

function parseSource(sourceFilePath: string): ts.SourceFile {
  return ts.createSourceFile(
    sourceFilePath,
    readFileSync(sourceFilePath, 'utf8'),
    ts.ScriptTarget.Latest,
    true
  );
}

function moduleImports(sourceFile: ts.SourceFile): Set<string> {
  const modules = new Set<string>();
  sourceFile.forEachChild((node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      modules.add(node.moduleSpecifier.text);
    }
  });
  return modules;
}

function hasIdentifierCall(sourceFile: ts.SourceFile, identifier: string): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      found = node.expression.text === identifier;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function hasPropertyCall(
  sourceFile: ts.SourceFile,
  objectName: string,
  propertyName: string
): boolean {
  let found = false;

  function visit(node: ts.Node): void {
    if (found) {
      return;
    }
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const callTarget = node.expression;
      found =
        ts.isIdentifier(callTarget.expression) &&
        callTarget.expression.text === objectName &&
        callTarget.name.text === propertyName;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return found;
}

function exportedFunctionNames(sourceFile: ts.SourceFile): Set<string> {
  const names = new Set<string>();

  sourceFile.forEachChild((node) => {
    if (!ts.isFunctionDeclaration(node) || node.name === undefined) {
      return;
    }
    const isExported =
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (isExported) {
      names.add(node.name.text);
    }
  });

  return names;
}

function exportedFunction(
  sourceFile: ts.SourceFile,
  functionName: string
): ts.FunctionDeclaration | null {
  let match: ts.FunctionDeclaration | null = null;

  sourceFile.forEachChild((node) => {
    if (match !== null || !ts.isFunctionDeclaration(node) || node.name === undefined) {
      return;
    }
    const isExported =
      node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
    if (isExported && node.name.text === functionName) {
      match = node;
    }
  });

  return match;
}

function hasJSDocTag(node: ts.Node, tagName: string): boolean {
  return ts.getJSDocTags(node).some((tag) => tag.tagName.text === tagName);
}

function collectCompositionRootViolations(): string[] {
  const violations: string[] = [];
  const warpGraph = parseSource(sourcePaths.warpGraph);
  const graphBridge = parseSource(sourcePaths.warpGraphBridge);
  const core = parseSource(sourcePaths.warpCore);
  const coreProduct = parseSource(sourcePaths.warpCoreProduct);
  const runtimeHostProduct = parseSource(sourcePaths.runtimeHostProduct);
  const runtimeHost = parseSource(sourcePaths.runtimeHost);
  const runtimeHostBoot = parseSource(sourcePaths.runtimeHostBoot);

  if (moduleImports(graphBridge).has('../WarpRuntime.ts')) {
    violations.push('WarpGraphRuntimeBridge imports the retired runtime class module');
  }
  if (hasPropertyCall(graphBridge, 'WarpRuntime', 'open')) {
    violations.push('WarpGraphRuntimeBridge calls the retired runtime class opener');
  }
  if (moduleImports(core).has('./warp/WarpCoreRuntimeBridge.ts')) {
    violations.push('WarpCore imports the deleted runtime bridge');
  }
  if (hasPropertyCall(core, 'WarpRuntime', 'open')) {
    violations.push('WarpCore calls the retired runtime class opener');
  }
  if (moduleImports(coreProduct).has('../WarpRuntime.ts')) {
    violations.push('WarpCoreRuntimeProduct imports the retired runtime class module');
  }
  if (hasPropertyCall(coreProduct, 'WarpRuntime', 'open')) {
    violations.push('WarpCoreRuntimeProduct calls the retired runtime class opener');
  }
  if (!moduleImports(runtimeHostProduct).has('../RuntimeHost.ts')) {
    violations.push('RuntimeHostProduct no longer imports the shared runtime host seam');
  }
  if (!hasIdentifierCall(runtimeHostProduct, 'openRuntimeHost')) {
    violations.push('RuntimeHostProduct no longer opens through the shared runtime host seam');
  }
  if (!moduleImports(runtimeHost).has('./warp/RuntimeHostBoot.ts')) {
    violations.push('RuntimeHost no longer imports the dedicated boot module');
  }
  if (!hasIdentifierCall(runtimeHost, 'resolveRuntimeHostConstructionOptions')) {
    violations.push(
      'RuntimeHost no longer delegates option resolution to the dedicated boot module'
    );
  }
  if (!exportedFunctionNames(runtimeHostBoot).has('resolveRuntimeHostConstructionOptions')) {
    violations.push('RuntimeHostBoot no longer exports the construction-option resolver');
  }
  const openWarpGraphDeclaration = exportedFunction(warpGraph, 'openWarpGraph');
  if (openWarpGraphDeclaration === null || !hasJSDocTag(openWarpGraphDeclaration, 'deprecated')) {
    violations.push('openWarpGraph is no longer documented as a deprecated compatibility surface');
  }

  return violations;
}

describe('openWarpGraph compatibility composition root', () => {
  it('keeps the deprecated compatibility factory from exposing runtime or implicit reads', async () => {
    const repo = createInMemoryRepo();

    try {
      const graph = await openWarpGraph({
        persistence: repo.persistence,
        graphName: 'compatibility-composition-root',
        writerId: 'alice',
      });

      expect(graph.graphName).toBe('compatibility-composition-root');
      expect(graph.writerId).toBe('alice');
      expect(Object.isFrozen(graph)).toBe(true);
      expect(Object.isFrozen(graph.commitment)).toBe(true);
      expect(Object.isFrozen(graph.revelation)).toBe(true);
      expect(graph.commitment.patches).toBe(graph.patches);
      expect(graph.revelation.query).toBe(graph.query);
      expect(Object.prototype.hasOwnProperty.call(graph, '_runtime')).toBe(false);
      expect('_runtime' in graph).toBe(false);

      await (await graph.patches.createPatch())
        .addNode('node:compatibility-composition-root')
        .commit();

      await expect(
        graph.query.hasNode('node:compatibility-composition-root')
      ).rejects.toMatchObject({
        code: 'E_NO_STATE',
      });
    } finally {
      await repo.cleanup();
    }
  });

  it('keeps source composition routed through the shared runtime host seam', () => {
    expect(collectCompositionRootViolations()).toEqual([]);
  });
});
