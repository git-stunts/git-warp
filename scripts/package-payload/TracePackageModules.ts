import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, posix } from 'node:path';
import ts from 'typescript';
import computedModuleLoads from './ComputedModuleLoads.ts';
import type PackagePayloadInventory from './PackagePayloadInventory.ts';
import PackageModuleTrace from './PackageModuleTrace.ts';

/** Traverses literal references while restricting every read to the packed inventory. */
export default function tracePackageModules(
  directory: string, roots: readonly string[], inventory: PackagePayloadInventory
): PackageModuleTrace {
  const paths = new Set(inventory.entries.map((entry) => entry.path));
  const queue = new Set(roots.map((path) => posix.normalize(path)));
  const packages = new Set<string>();
  const findings: string[] = [];
  for (const path of queue) {
    if (!paths.has(path)) {
      findings.push(`Missing supported module or relative import: ${path}`);
      continue;
    }
    const source = readFileSync(join(directory, path), 'utf8');
    const references = ts.preProcessFile(source, true, true);
    localReferences(path, references).forEach((reference) => queue.add(reference));
    packageNames(references).forEach((name) => packages.add(name));
    findings.push(...computedModuleLoads(source, path));
  }
  return new PackageModuleTrace(queue, packages, findings);
}

/** Resolves declaration imports written with either .js or source .ts extensions. */
function localReferences(path: string, references: ts.PreProcessedFileInfo): string[] {
  const imports = references.importedFiles.filter((reference) => reference.fileName.startsWith('.'));
  return [...imports, ...references.referencedFiles].map(({ fileName }) => {
    const target = posix.normalize(posix.join(posix.dirname(path), fileName));
    if (!path.endsWith('.d.ts') || target.endsWith('.d.ts')) {
      return target;
    }
    return target.replace(/\.(?:js|ts)$/u, '.d.ts');
  });
}

/** Collects external package roots while excluding Node built-ins. */
function packageNames(references: ts.PreProcessedFileInfo): string[] {
  return references.importedFiles.map(({ fileName }) => fileName)
    .filter((name) => !name.startsWith('.') && !name.startsWith('node:') && !builtinModules.includes(name))
    .map((name) => name.split('/').slice(0, name.startsWith('@') ? 2 : 1).join('/'));
}
