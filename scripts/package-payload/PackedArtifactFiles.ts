import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import ts from 'typescript';

const INLINE_LINK_PATTERN = /\]\((?<target>[^)\s]+)(?:\s+"[^"]*")?\)/gu;
const REFERENCE_LINK_PATTERN = /^\s*\[[^\]]+\]:\s*(?<target>\S+)/gmu;
const EXTERNAL_TARGET_PATTERN = /^(?:[a-z][a-z0-9+.-]*:|#)/iu;

/** Lists files with the given suffix below a directory, skipping node_modules. */
export function listFiles(directory: string, suffix: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (entry === 'node_modules') {
      continue;
    }
    if (statSync(path).isDirectory()) {
      files.push(...listFiles(path, suffix));
    } else if (entry.endsWith(suffix)) {
      files.push(path);
    }
  }
  return files;
}

/** Returns every inline and reference-style link target in a Markdown document. */
export function markdownLinkTargets(markdown: string): string[] {
  return [...markdown.matchAll(INLINE_LINK_PATTERN), ...markdown.matchAll(REFERENCE_LINK_PATTERN)]
    .map((match) => match.groups?.['target'])
    .filter((target): target is string => target !== undefined);
}

/** Returns the relative module specifiers a JavaScript source imports or re-exports. */
export function relativeImportSpecifiers(source: string): string[] {
  return ts
    .preProcessFile(source, true, true)
    .importedFiles.map((reference) => reference.fileName)
    .filter((specifier) => specifier.startsWith('./') || specifier.startsWith('../'));
}

/** Lists shipped Markdown links that point outside the package or at a missing file. */
export function findEscapingDocumentLinks(packageDir: string): string[] {
  const escaping: string[] = [];
  for (const file of listFiles(packageDir, '.md')) {
    const targets = markdownLinkTargets(readFileSync(file, 'utf8')).filter(
      (target) => !EXTERNAL_TARGET_PATTERN.test(target)
    );
    for (const target of targets) {
      const resolved = resolve(dirname(file), target.replace(/#.*$/su, ''));
      if (!isShippedPath(packageDir, resolved)) {
        escaping.push(`${relative(packageDir, file)} -> ${target}`);
      }
    }
  }
  return escaping;
}

/** Lists relative imports in shipped JavaScript that do not resolve inside the package. */
export function findUnresolvedImports(packageDir: string): string[] {
  const unresolved: string[] = [];
  for (const file of listFiles(join(packageDir, 'dist'), '.js')) {
    for (const specifier of relativeImportSpecifiers(readFileSync(file, 'utf8'))) {
      const target = resolve(dirname(file), specifier);
      if (!isShippedPath(packageDir, target) || !statSync(target).isFile()) {
        unresolved.push(`${relative(packageDir, file)} -> ${specifier}`);
      }
    }
  }
  return unresolved;
}

/** Checks that an existing target remains inside the installed package. */
function isShippedPath(packageDir: string, path: string): boolean {
  const fromPackage = relative(packageDir, path);
  return !fromPackage.startsWith('..') && !isAbsolute(fromPackage) && existsSync(path);
}
