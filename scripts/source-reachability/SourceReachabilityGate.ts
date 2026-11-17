import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import packageRuntimeRoots from '../package-payload/PackageRuntimeRoots.ts';
import parseSourceAllowances, { UNREACHABLE_SOURCE_ALLOWLIST_PATH } from './parseSourceAllowances.ts';
import SourceAllowanceHistory from './SourceAllowanceHistory.ts';

export { UNREACHABLE_SOURCE_ALLOWLIST_PATH } from './parseSourceAllowances.ts';
const SOURCE_ROOT = 'src';

export type SourceReachabilityReport = Readonly<{
  readonly reached: number;
  readonly unreachable: readonly string[];
  readonly violations: readonly string[];
}>;

/** Checks current inventory; a history basis also enforces shrink-only admission across the branch. */
export function checkSourceReachability(
  root: string, history?: Readonly<{ base: string; initialCommit?: string }>,
): SourceReachabilityReport {
  const base = resolve(root);
  const reached = reachableSources(base);
  const unreachable = listSources(join(base, SOURCE_ROOT))
    .map((path) => relative(base, path).split(sep).join('/'))
    .filter((path) => !reached.has(path))
    .sort();
  const path = join(base, UNREACHABLE_SOURCE_ALLOWLIST_PATH);
  const allowed = parseSourceAllowances(existsSync(path) ? readFileSync(path, 'utf8') : '');
  const missing = new Set(unreachable);
  const violations = [
    ...allowed.problems,
    ...unreachable.filter((path) => !allowed.paths.has(path)).map((path) => `NEW unreachable source ${path}`),
    ...[...allowed.paths].filter((path) => !missing.has(path)).map((path) => `STALE allowance ${path}: it is reachable or gone; remove it`),
    ...(history === undefined || allowed.problems.length > 0 ? [] : new SourceAllowanceHistory(base, history.initialCommit).check(history.base)),
  ];
  return Object.freeze({ reached: reached.size, unreachable: Object.freeze(unreachable), violations: Object.freeze(violations) });
}

/** Source modules the package runtime roots reach through static, type and literal dynamic imports. */
function reachableSources(base: string): ReadonlySet<string> {
  const pending = packageRuntimeRoots(base).map((path) => sourceForEmitted(base, path)).filter((path) => existsSync(path));
  const seen = new Set<string>();
  for (let path = pending.pop(); path !== undefined; path = pending.pop()) {
    if (seen.has(path)) continue;
    seen.add(path);
    const info = ts.preProcessFile(readFileSync(path, 'utf8'), true, true);
    for (const { fileName } of [...info.importedFiles, ...info.referencedFiles]) {
      const target = resolveRelative(path, fileName);
      if (target !== null) pending.push(target);
    }
  }
  return new Set([...seen].map((path) => relative(base, path).split(sep).join('/')));
}

function sourceForEmitted(base: string, emitted: string): string {
  return join(base, emitted.replace(/^\.?\/?dist\//u, '').replace(/\.js$/u, '.ts'));
}

function resolveRelative(from: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const target = resolve(dirname(from), specifier);
  const candidates = [target, target.replace(/\.js$/u, '.ts'), `${target}.ts`, join(target, 'index.ts')];
  return candidates.find((path) => path.endsWith('.ts') && existsSync(path)) ?? null;
}

function listSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listSources(path);
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts') ? [path] : [];
  });
}
