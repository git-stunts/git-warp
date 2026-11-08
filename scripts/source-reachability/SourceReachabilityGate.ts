import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import ts from 'typescript';
import packageRuntimeRoots from '../package-payload/PackageRuntimeRoots.ts';

export const UNREACHABLE_SOURCE_ALLOWLIST_PATH = 'policy/unreachable-source-allowlist.txt';
const SOURCE_ROOT = 'src';
const ALLOWANCE = /^#([1-9][0-9]*)\t(src\/[^\t\r\n]+\.ts)$/u;

export type SourceReachabilityReport = Readonly<{
  readonly reached: number;
  readonly unreachable: readonly string[];
  readonly violations: readonly string[];
}>;

/** Fails on an unreachable src file that is not allowed, and on an allowance that no longer names one. */
export function checkSourceReachability(root: string): SourceReachabilityReport {
  const base = resolve(root);
  const reached = reachableSources(base);
  const unreachable = listSources(join(base, SOURCE_ROOT))
    .map((path) => relative(base, path).split(sep).join('/'))
    .filter((path) => !reached.has(path))
    .sort();
  const allowed = readAllowances(join(base, UNREACHABLE_SOURCE_ALLOWLIST_PATH));
  const missing = new Set(unreachable);
  const violations = [
    ...allowed.problems,
    ...unreachable.filter((path) => !allowed.paths.has(path)).map((path) => `NEW unreachable source ${path}`),
    ...[...allowed.paths].filter((path) => !missing.has(path)).map((path) => `STALE allowance ${path}: it is reachable or gone; remove it`),
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

function readAllowances(path: string): Readonly<{ paths: ReadonlySet<string>; problems: readonly string[] }> {
  if (!existsSync(path)) return Object.freeze({ paths: new Set<string>(), problems: Object.freeze([]) });
  const paths = new Set<string>();
  const problems: string[] = [];
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    if (line === '' || line.startsWith('# ')) continue;
    const match = ALLOWANCE.exec(line);
    const allowed = match?.[2];
    if (allowed === undefined) problems.push(`MALFORMED allowance: ${line}`);
    else if (paths.has(allowed)) problems.push(`DUPLICATE allowance ${allowed}`);
    else paths.add(allowed);
  }
  return Object.freeze({ paths, problems: Object.freeze(problems) });
}
