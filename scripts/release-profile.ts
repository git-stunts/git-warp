#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { isMap, isScalar, isSeq, parseDocument } from 'yaml';
import type { Node, YAMLMap } from 'yaml';

export type ReleaseVersionSource = {
  readonly path: string;
  readonly type: 'json' | 'npm-lock-root';
  readonly field: string;
  readonly required?: boolean;
  readonly private?: boolean;
};

export type ReleaseDocsProfile = {
  readonly changelog: string;
  readonly front_door: string;
  readonly architecture: string;
  readonly learning_index: string;
  readonly learning_topics: string;
  readonly operations: string;
  readonly contributor: readonly string[];
};

export type ReleaseProfile = {
  readonly schema: 1;
  readonly version_sources: readonly ReleaseVersionSource[];
  readonly docs: ReleaseDocsProfile;
};

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const PROFILE_PATH = '.continuum/release.yml';

class ReleaseProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReleaseProfileError';
  }
}

function readMapDocument(path: string, label: string): YAMLMap {
  const document = parseDocument(readFileSync(path, 'utf8'));
  if (document.errors.length > 0) {
    const parseError = document.errors[0]?.message ?? 'invalid document';
    throw new ReleaseProfileError(`${label} could not be parsed: ${parseError}`);
  }
  if (!isMap(document.contents)) {
    throw new ReleaseProfileError(`${label} must be a map`);
  }
  return document.contents;
}

function requireMapNode(node: Node | null | undefined, label: string): YAMLMap {
  if (!isMap(node)) {
    throw new ReleaseProfileError(`${label} must be a map`);
  }
  return node;
}

function requireMapField(map: YAMLMap, key: string, label: string): YAMLMap {
  return requireMapNode(map.get(key, true), label);
}

function requireStringField(map: YAMLMap, key: string, label: string): string {
  const node = map.get(key, true);
  if (!isScalar(node) || typeof node.value !== 'string' || node.value.length === 0) {
    throw new ReleaseProfileError(`${label} must be a non-empty string`);
  }
  return node.value;
}

function requireNonEmptyString(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReleaseProfileError(`${label} must be a non-empty string`);
  }
  return value;
}

function requireSchemaOne(map: YAMLMap): 1 {
  const node = map.get('schema', true);
  if (!isScalar(node) || node.value !== 1) {
    throw new ReleaseProfileError('schema must be 1');
  }
  return 1;
}

function requireStringArrayField(map: YAMLMap, key: string, label: string): readonly string[] {
  const node = map.get(key, true);
  if (!isSeq(node)) {
    throw new ReleaseProfileError(`${label} must be a non-empty string array`);
  }
  const values: string[] = [];
  for (const item of node.items) {
    if (!isScalar(item) || typeof item.value !== 'string' || item.value.length === 0) {
      throw new ReleaseProfileError(`${label} must be a non-empty string array`);
    }
    values.push(item.value);
  }
  if (values.length === 0) {
    throw new ReleaseProfileError(`${label} must be a non-empty string array`);
  }
  return values;
}

function assertVersionSourceType(
  value: string,
  label: string
): ReleaseVersionSource['type'] {
  if (value !== 'json' && value !== 'npm-lock-root') {
    throw new ReleaseProfileError(`${label} must be json or npm-lock-root`);
  }
  return value;
}

function optionalBooleanField(map: YAMLMap, key: string, label: string): boolean | undefined {
  const node = map.get(key, true);
  if (node === undefined) {
    return undefined;
  }
  if (!isScalar(node) || typeof node.value !== 'boolean') {
    throw new ReleaseProfileError(`${label} must be boolean when present`);
  }
  return node.value;
}

function normalizeProfile(profile: YAMLMap): ReleaseProfile {
  const schema = requireSchemaOne(profile);
  const versionSourcesNode = profile.get('version_sources', true);
  if (!isSeq(versionSourcesNode) || versionSourcesNode.items.length === 0) {
    throw new ReleaseProfileError('version_sources must contain at least one source');
  }
  const docs = requireMapField(profile, 'docs', 'docs profile');

  return Object.freeze({
    schema,
    version_sources: versionSourcesNode.items.map((source, index) => {
      if (!isMap(source)) {
        throw new ReleaseProfileError(`version_sources[${index}] must be a map`);
      }
      const sourceMap = source;
      const required = optionalBooleanField(sourceMap, 'required', `version_sources[${index}].required`);
      const privateSource = optionalBooleanField(sourceMap, 'private', `version_sources[${index}].private`);
      return Object.freeze({
        path: requireStringField(sourceMap, 'path', `version_sources[${index}].path`),
        type: assertVersionSourceType(
          requireStringField(sourceMap, 'type', `version_sources[${index}].type`),
          `version_sources[${index}].type`
        ),
        field: requireStringField(sourceMap, 'field', `version_sources[${index}].field`),
        ...(required === undefined ? {} : { required }),
        ...(privateSource === undefined ? {} : { private: privateSource }),
      });
    }),
    docs: Object.freeze({
      changelog: requireStringField(docs, 'changelog', 'docs.changelog'),
      front_door: requireStringField(docs, 'front_door', 'docs.front_door'),
      architecture: requireStringField(docs, 'architecture', 'docs.architecture'),
      learning_index: requireStringField(docs, 'learning_index', 'docs.learning_index'),
      learning_topics: requireStringField(docs, 'learning_topics', 'docs.learning_topics'),
      operations: requireStringField(docs, 'operations', 'docs.operations'),
      contributor: requireStringArrayField(docs, 'contributor', 'docs.contributor'),
    }),
  });
}

export function loadReleaseProfile(root: string = ROOT): ReleaseProfile {
  const profilePath = join(root, PROFILE_PATH);
  return normalizeProfile(readMapDocument(profilePath, PROFILE_PATH));
}

function listMarkdownFiles(root: string, directoryPath: string): readonly string[] {
  const absoluteDirectory = join(root, directoryPath);
  if (!existsSync(absoluteDirectory) || !statSync(absoluteDirectory).isDirectory()) {
    return [];
  }
  return readdirSync(absoluteDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => `${directoryPath.replace(/\/$/, '')}/${entry.name}`)
    .sort();
}

export function collectReleaseDocPaths(root: string = ROOT): readonly string[] {
  const profile = loadReleaseProfile(root);
  return Array.from(new Set([
    PROFILE_PATH,
    profile.docs.changelog,
    profile.docs.front_door,
    profile.docs.architecture,
    profile.docs.learning_index,
    ...listMarkdownFiles(root, profile.docs.learning_topics),
    profile.docs.operations,
    ...profile.docs.contributor,
  ]));
}

function expandVersionSourcePaths(root: string, source: ReleaseVersionSource): readonly string[] {
  if (!source.path.includes('*')) {
    return [source.path];
  }

  const segments = source.path.split('/');
  const globIndex = segments.findIndex((segment) => segment === '*');
  const globCount = segments.filter((segment) => segment === '*').length;
  if (globIndex === -1 || globCount !== 1 || source.path.includes('**')) {
    throw new ReleaseProfileError(`unsupported version source glob: ${source.path}`);
  }

  const prefix = segments.slice(0, globIndex);
  const suffix = segments.slice(globIndex + 1);
  const parentDirectory = join(root, ...prefix);
  if (!existsSync(parentDirectory) || !statSync(parentDirectory).isDirectory()) {
    return [];
  }

  return readdirSync(parentDirectory, { withFileTypes: true })
    .map((entry) => [...prefix, entry.name, ...suffix].join('/'))
    .filter((path) => existsSync(join(root, path)))
    .sort();
}

function readVersion(source: ReleaseVersionSource, packageMap: YAMLMap, packagePath: string): string {
  if (source.type === 'npm-lock-root') {
    const packagesMap = requireMapField(packageMap, 'packages', `${packagePath}.packages`);
    const rootPackageMap = requireMapField(packagesMap, '', `${packagePath}.packages[""]`);
    return requireStringField(rootPackageMap, 'version', `${packagePath}.packages[""].version`);
  }
  return requireStringField(packageMap, source.field, `${packagePath}.${source.field}`);
}

export function collectVersionLockstepFailures(expectedVersion: string, root: string = ROOT): readonly string[] {
  const profile = loadReleaseProfile(root);
  const failures: string[] = [];

  for (const source of profile.version_sources) {
    const paths = expandVersionSourcePaths(root, source);
    if (source.required === true && paths.length === 0) {
      failures.push(`${source.path} did not match any files`);
    }
    for (const path of paths) {
      const fullPath = join(root, path);
      if (!existsSync(fullPath)) {
        failures.push(`${path} is missing`);
        continue;
      }
      const packageMap = readMapDocument(fullPath, path);
      const version = readVersion(source, packageMap, path);
      if (version !== expectedVersion) {
        failures.push(`${path} ${source.field} ${version} != ${expectedVersion}`);
      }
      if (source.private === true && optionalBooleanField(packageMap, 'private', `${path}.private`) !== true) {
        failures.push(`${path} must remain private unless publish policy changes`);
      }
    }
  }

  return failures;
}

export function runReleaseProfileCli(argv: readonly string[]): number {
  const command = argv[2];
  if (command === 'required-docs') {
    for (const path of collectReleaseDocPaths()) {
      console.log(path);
    }
    return 0;
  }
  if (command === 'check-version-lockstep') {
    const expectedVersion = requireNonEmptyString(argv[3], 'expected version');
    const failures = collectVersionLockstepFailures(expectedVersion);
    for (const failure of failures) {
      console.error(failure);
    }
    return failures.length === 0 ? 0 : 1;
  }

  console.error('usage: node scripts/release-profile.ts required-docs');
  console.error('   or: node scripts/release-profile.ts check-version-lockstep <version>');
  return 2;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = runReleaseProfileCli(process.argv);
}
