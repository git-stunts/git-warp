import { join } from 'node:path';
import { z } from 'zod';
import PackedArtifactBoundaryAdapter from '../../src/infrastructure/adapters/PackedArtifactBoundaryAdapter.ts';
import type PackagePayloadInventory from './PackagePayloadInventory.ts';
import type PackageModuleTrace from './PackageModuleTrace.ts';
import tracePackageModules from './TracePackageModules.ts';

const EXPORT = z.union([z.string(), z.object({
  types: z.string().optional(), import: z.string().optional(), default: z.string().optional(),
})]);
const METADATA = z.object({
  exports: z.record(z.string(), EXPORT),
  bin: z.record(z.string(), z.string()),
  dependencies: z.record(z.string(), z.string()).default({}),
  devDependencies: z.record(z.string(), z.string()).default({}),
  peerDependencies: z.record(z.string(), z.string()).default({}),
  optionalDependencies: z.record(z.string(), z.string()).default({}),
});
type PackageMetadata = z.infer<typeof METADATA>;
const SUPPORTED_COMMAND_ROOTS = ['dist/bin/git-warp.js', 'dist/scripts/upgrade-v16-to-v17.js'];
const NON_REGISTRY_SPECIFIER = /^(?:file:|link:|workspace:|git(?:\+|:)|https?:|github:)/u;
const MUTABLE_TAG = /^[a-zA-Z][a-zA-Z0-9._-]*$/u;
const WILDCARD_RANGE = /(?:\*|(?:^|[.\s~^<>=|])[xX](?=$|[.\s|]))/u;

/** Inspects the real packed tree from supported exports, executables, and legacy commands. */
export default function inspectPackageBundle(directory: string, inventory: PackagePayloadInventory): string[] {
  const metadata = new PackedArtifactBoundaryAdapter().read(join(directory, 'package.json'), METADATA);
  const roots = [...SUPPORTED_COMMAND_ROOTS, ...publicRoots(metadata),
    ...Object.values(metadata.bin).filter((path) => path.endsWith('.js'))];
  const trace = tracePackageModules(directory, roots, inventory);
  return [...dependencyFindings(metadata, trace), ...trace.findings, ...unreachableFiles(inventory, trace)];
}

/** Includes runtime and type conditions while omitting exported metadata JSON. */
function publicRoots(metadata: PackageMetadata): string[] {
  return Object.values(metadata.exports).flatMap((exported) => {
    const candidates = typeof exported === 'string' ? [exported] :
      [exported.import, exported.default, exported.types];
    return candidates.filter((path): path is string => path !== undefined)
      .filter((path) => path.endsWith('.js') || path.endsWith('.d.ts'));
  });
}

/** Reports missing/dev-only imports and direct requirements with no traced uses. */
function dependencyFindings(metadata: PackageMetadata, trace: PackageModuleTrace): string[] {
  const missing = trace.packages.filter((name) => !declaresProductionDependency(metadata, name));
  const findings = missing.map((name) => {
    const kind = Object.hasOwn(metadata.devDependencies, name) ? 'dev-only' : 'undeclared';
    return `Required import has ${kind} production dependency: ${name}`;
  });
  for (const name of Object.keys(metadata.dependencies).sort()) {
    if (!trace.packages.includes(name)) {
      findings.push(`Possibly unused direct production dependency: ${name}`);
    }
  }
  return [...findings, ...dependencyRequirements(metadata)];
}

/** Peers and optional dependencies are declared consumer capabilities too. */
function declaresProductionDependency(metadata: PackageMetadata, name: string): boolean {
  return Object.hasOwn(metadata.dependencies, name) || Object.hasOwn(metadata.peerDependencies, name) ||
    Object.hasOwn(metadata.optionalDependencies, name);
}

/** Flags local/VCS requirements, wildcard ranges, and mutable dist-tags for review. */
function dependencyRequirements(metadata: PackageMetadata): string[] {
  const requirements = { ...metadata.peerDependencies, ...metadata.optionalDependencies, ...metadata.dependencies };
  return Object.entries(requirements).filter(([, specifier]) =>
    NON_REGISTRY_SPECIFIER.test(specifier) || MUTABLE_TAG.test(specifier) || WILDCARD_RANGE.test(specifier))
    .map(([name, specifier]) => `Review nonportable or unbounded dependency requirement: ${name}@${specifier}`).sort();
}

/** Treats untraced files as review candidates, preserving supported behavior. */
function unreachableFiles(inventory: PackagePayloadInventory, trace: PackageModuleTrace): string[] {
  const retained = new Set(trace.paths);
  return inventory.entries.filter((entry) => !retained.has(entry.path)).flatMap(({ path }) => {
    if (path.endsWith('.js')) {
      return [`Possibly unnecessary JavaScript: ${path}`];
    }
    if (path.endsWith('.d.ts')) {
      return [`Unreachable public declaration: ${path}`];
    }
    return [];
  }).sort();
}
