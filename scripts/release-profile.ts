#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { parse } from 'yaml';

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

function readJson(path: string) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function assertString(value: string | undefined, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ReleaseProfileError(`${label} must be a non-empty string`);
  }
  return value;
}

function assertStringArray(value: readonly string[] | undefined, label: string): readonly string[] {
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || entry.length === 0)) {
    throw new ReleaseProfileError(`${label} must be a non-empty string array`);
  }
  return value;
}

function assertVersionSourceType(
  value: ReleaseVersionSource['type'] | undefined,
  label: string
): ReleaseVersionSource['type'] {
  if (value !== 'json' && value !== 'npm-lock-root') {
    throw new ReleaseProfileError(`${label} must be json or npm-lock-root`);
  }
  return value;
}

function assertOptionalBoolean(value: boolean | undefined, label: string): boolean | undefined {
  if (value !== undefined && typeof value !== 'boolean') {
    throw new ReleaseProfileError(`${label} must be boolean when present`);
  }
  return value;
}

function normalizeProfile(profile: Partial<ReleaseProfile>): ReleaseProfile {
  if (profile.schema !== 1) {
    throw new ReleaseProfileError('schema must be 1');
  }
  if (!Array.isArray(profile.version_sources) || profile.version_sources.length === 0) {
    throw new ReleaseProfileError('version_sources must contain at least one source');
  }
  if (profile.docs === undefined) {
    throw new ReleaseProfileError('docs profile is required');
  }

  return Object.freeze({
    schema: 1,
    version_sources: profile.version_sources.map((source, index) => {
      const required = assertOptionalBoolean(source.required, `version_sources[${index}].required`);
      const privateSource = assertOptionalBoolean(source.private, `version_sources[${index}].private`);
      return Object.freeze({
        path: assertString(source.path, `version_sources[${index}].path`),
        type: assertVersionSourceType(source.type, `version_sources[${index}].type`),
        field: assertString(source.field, `version_sources[${index}].field`),
        ...(required === undefined ? {} : { required }),
        ...(privateSource === undefined ? {} : { private: privateSource }),
      });
    }),
    docs: Object.freeze({
      changelog: assertString(profile.docs.changelog, 'docs.changelog'),
      front_door: assertString(profile.docs.front_door, 'docs.front_door'),
      architecture: assertString(profile.docs.architecture, 'docs.architecture'),
      learning_index: assertString(profile.docs.learning_index, 'docs.learning_index'),
      learning_topics: assertString(profile.docs.learning_topics, 'docs.learning_topics'),
      operations: assertString(profile.docs.operations, 'docs.operations'),
      contributor: assertStringArray(profile.docs.contributor, 'docs.contributor'),
    }),
  });
}

export function loadReleaseProfile(root: string = ROOT): ReleaseProfile {
  const profilePath = join(root, PROFILE_PATH);
  const parsed = parse(readFileSync(profilePath, 'utf8')) as Partial<ReleaseProfile>;
  return normalizeProfile(parsed);
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

function readVersion(source: ReleaseVersionSource, packagePath: string, root: string): string {
  const packageJson = readJson(join(root, packagePath));
  if (source.type === 'npm-lock-root') {
    return packageJson.packages[''].version;
  }
  return packageJson[source.field];
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
      const version = readVersion(source, path, root);
      if (version !== expectedVersion) {
        failures.push(`${path} ${source.field} ${version} != ${expectedVersion}`);
      }
      if (source.private === true && readJson(fullPath).private !== true) {
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
    const expectedVersion = assertString(argv[3], 'expected version');
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
