#!/usr/bin/env node

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export type SourceVersionNameViolation = {
  readonly path: string;
  readonly line: number;
  readonly token: string;
  readonly source: string;
};

type SourceVersionNameException = {
  readonly name: string;
  readonly reason: string;
  readonly pattern: RegExp;
};

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SOURCE_ROOT = 'src';
const SOURCE_EXTENSIONS = Object.freeze(['.ts', '.tsx', '.d.ts']);
const SCRIPT_PATH = relative(ROOT, fileURLToPath(import.meta.url));

const VERSION_TOKEN_PATTERN = new RegExp([
  '\\b(?:',
  '[A-Za-z_][A-Za-z0-9_]*(?:V[0-9]+|v[0-9]+|VX|Vx|vX)[A-Za-z0-9_]*',
  '|',
  '[vV][0-9]+(?:\\.[0-9]+){0,2}(?:[A-Za-z0-9._:-]*)',
  ')\\b',
].join(''), 'g');

const VERSIONED_PATH_PATTERN =
  /[A-Za-z0-9_]*(?:V[0-9]+|v[0-9]+|VX|Vx|vX)[A-Za-z0-9_]*|(^|[/._-])[vV][0-9]+([/._-]|$)/;

function policyPattern(parts: readonly string[]): RegExp {
  return new RegExp(parts.join(''));
}

const sourceVersionNameExceptions: readonly SourceVersionNameException[] = Object.freeze([
  Object.freeze({
    name: 'network-address-family',
    reason: 'IPv4 and IPv6 are network address families, not release names.',
    pattern: /\bIPv[46]\b/,
  }),
  Object.freeze({
    name: 'fnv-1a-hash',
    reason: 'FNV-1a is an algorithm name, not a release name.',
    pattern: /\bfnv1a/i,
  }),
  Object.freeze({
    name: 'v8-runtime',
    reason: 'V8 is a JavaScript runtime name, not a git-warp release name.',
    pattern: /\bV8\b/,
  }),
  Object.freeze({
    name: 'immutable-wire-token',
    reason: 'Persisted protocol, codec, signature, and domain-separation tokens must remain byte-stable.',
    pattern: policyPattern([
      '(?:',
      'git-warp:',
      '|git-warp\\.receipt-envelope-boundary/v[0-9]+',
      '|coordinate-(?:compare|comparison|transfer)\\S*/v[0-9]+',
      '|graph-diff/v[0-9]+',
      '|ttd-merge-inspection/v[0-9]+',
      '|visible-state-\\S*/v[0-9]+',
      '|frontier-lamport/v[0-9]+',
      '|conflict-analyzer/v[0-9]+',
      '|basis-facts-v[0-9]+',
      '|streamed-facts-v[0-9]+',
      '|warp-v[0-9]+',
      '|full-v[0-9]+',
      '|git-cas-cbor-patch-v[0-9]+',
      '|cbor-v[0-9]+',
      '|(?:whole|framed|convergent)-v[0-9]+',
      '|wesley\\.realization\\.manifest\\.v[0-9]+',
      '|property-target-key:length-prefixed-v[0-9]+',
      '|effect-emission-v[0-9]+',
      '|PATCH_STORAGE_FORMAT',
      '|CHECKPOINT_STORAGE_FORMAT',
      ')',
    ]),
  }),
  Object.freeze({
    name: 'protocol-schema-prose',
    reason: 'Protocol docs in source comments may name immutable schema or spec versions.',
    pattern: policyPattern([
      '(?:',
      'schema v[0-9]+',
      '|Schema v[0-9]+',
      '|schema:[0-9]+',
      '|Spec v[0-9]+',
      '|TECH-SPEC-V[0-9]+',
      '|WARP V[0-9]+ Spec',
      '|Trust V[0-9]+',
      '|V[0-9]+ trust assessment',
      '|v[0-9]+ requires',
      '|v[0-9]+ descriptor',
      '|v[0-9]+ supported values',
      ')',
    ]),
  }),
  Object.freeze({
    name: 'current-format-prose',
    reason: 'A few source comments still describe immutable current storage formats.',
    pattern: policyPattern([
      '(?:',
      'WARP v[0-9]+ \\(schema:[0-9]+\\) patches',
      '|WARP V[0-9]+ state',
      '|WARP v[0-9]+ reducer',
      '|materialized V[0-9]+ state',
      '|V[0-9]+ state serialization',
      '|full V[0-9]+ state',
      '|derived from a WARP V[0-9]+ state',
      '|applied version vector',
      '|current v[0-9]+ scope',
      '|v[0-9]+ default',
      '|v[0-9]+ uses',
      ')',
    ]),
  }),
  Object.freeze({
    name: 'legacy-compatibility-prose',
    reason: 'Active compatibility parsers may document historical formats they still accept.',
    pattern: policyPattern([
      '(?:',
      'legacy v[0-9]+',
      '|v[0-9]+ backward compatibility',
      '|v[0-9]+ JSON anchors',
      '|v[0-9]+ trailer-based anchors',
      '|removed in v[0-9]+',
      ')',
    ]),
  }),
  Object.freeze({
    name: 'seek-cache-version-token',
    reason: 'Seek-cache keys use a persisted version prefix to avoid cache-key collisions.',
    pattern: /src\/domain\/utils\/seekCacheKey\.ts/,
  }),
]);

export const SOURCE_VERSION_NAME_EXCEPTIONS = sourceVersionNameExceptions;

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (SOURCE_EXTENSIONS.some((extension) => entry.name.endsWith(extension))) {
      files.push(path);
    }
  }
  return files.sort();
}

function exceptionApplies(path: string, line: string, token: string): boolean {
  const context = `${path}\n${token}\n${line}`;
  return SOURCE_VERSION_NAME_EXCEPTIONS.some((exception) => exception.pattern.test(context));
}

function collectLineViolations(path: string, source: string): SourceVersionNameViolation[] {
  const violations: SourceVersionNameViolation[] = [];
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    for (const match of line.matchAll(VERSION_TOKEN_PATTERN)) {
      const token = match[0];
      if (!exceptionApplies(path, line, token)) {
        violations.push({
          path,
          line: index + 1,
          token,
          source: line.trim(),
        });
      }
    }
  });
  return violations;
}

export function findSourceVersionNameViolations(
  files: readonly { readonly path: string; readonly source: string }[],
): SourceVersionNameViolation[] {
  const violations: SourceVersionNameViolation[] = [];
  for (const file of files) {
    if (VERSIONED_PATH_PATTERN.test(file.path) && !exceptionApplies(file.path, file.path, file.path)) {
      violations.push({
        path: file.path,
        line: 0,
        token: file.path,
        source: 'versioned source path',
      });
    }
    violations.push(...collectLineViolations(file.path, file.source));
  }
  return violations;
}

export function scanSourceVersionNames(): SourceVersionNameViolation[] {
  return findSourceVersionNameViolations(
    sourceFiles(join(ROOT, SOURCE_ROOT)).map((path) => ({
      path: relative(ROOT, path),
      source: readFileSync(path, 'utf8'),
    })),
  );
}

function printViolations(violations: readonly SourceVersionNameViolation[]): void {
  console.error('Source version-name policy failed.\n');
  console.error('Active src/ symbols and paths must not carry release versions.');
  console.error('Immutable wire/protocol tokens need named exceptions in this script.\n');
  for (const violation of violations) {
    console.error(`${violation.path}:${violation.line}: ${violation.token}`);
    console.error(`  ${violation.source}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const violations = scanSourceVersionNames();
  if (violations.length > 0) {
    printViolations(violations);
    process.exit(1);
  }
  console.log(`${SCRIPT_PATH}: source version-name policy passed.`);
}
