import {
  mkdtempSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  dirname,
  join,
  resolve,
} from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const WESLEY_VERSION = '0.3.0-alpha.1';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIRECTORY, '../..');
const FIXTURE_DIRECTORY = join(ROOT, 'test/fixtures/generated-sdk');
const SCHEMA_PATH = join(FIXTURE_DIRECTORY, 'users.graphql');
const WESLEY_OUTPUT_PATH = join(
  FIXTURE_DIRECTORY,
  'users.wesley.generated.ts',
);
const SDK_OUTPUT_PATH = join(FIXTURE_DIRECTORY, 'users.generated.ts');
const RENDERER_PATH = join(
  SCRIPT_DIRECTORY,
  'RenderUsersSdkFixture.ts',
);

class GeneratedSdkFixtureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedSdkFixtureError';
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function requireWesleyVersion(wesley: string): void {
  const version = execFileSync(wesley, ['--version'], {
    encoding: 'utf8',
  }).trim();
  if (version !== WESLEY_VERSION) {
    throw new GeneratedSdkFixtureError(
      `Wesley ${WESLEY_VERSION} is required; received ${version}`,
    );
  }
}

function emitWesleyTypes(wesley: string, output: string): void {
  execFileSync(
    wesley,
    [
      'emit',
      'typescript',
      '--schema',
      SCHEMA_PATH,
      '--out',
      output,
    ],
    { stdio: 'inherit' },
  );
}

function renderSdk(output: string): void {
  execFileSync(
    process.execPath,
    [RENDERER_PATH, '--out', output],
    { stdio: 'inherit' },
  );
}

function requireMatchingFile(
  expectedPath: string,
  generatedPath: string,
): void {
  const expected = readFileSync(expectedPath);
  const generated = readFileSync(generatedPath);
  if (!expected.equals(generated)) {
    throw new GeneratedSdkFixtureError(
      `${expectedPath} has drifted; run npm run generate:sdk-fixture`,
    );
  }
}

function checkFixture(wesley: string): void {
  const temporaryDirectory = mkdtempSync(
    join(tmpdir(), 'git-warp-generated-sdk-'),
  );
  try {
    const wesleyOutput = join(temporaryDirectory, 'users.wesley.generated.ts');
    const sdkOutput = join(temporaryDirectory, 'users.generated.ts');
    emitWesleyTypes(wesley, wesleyOutput);
    requireMatchingFile(WESLEY_OUTPUT_PATH, wesleyOutput);
    renderSdk(sdkOutput);
    requireMatchingFile(SDK_OUTPUT_PATH, sdkOutput);
  } finally {
    rmSync(temporaryDirectory, { force: true, recursive: true });
  }
}

function generateFixture(wesley: string): void {
  emitWesleyTypes(wesley, WESLEY_OUTPUT_PATH);
  renderSdk(SDK_OUTPUT_PATH);
}

const wesley = argumentValue('--wesley') ?? 'wesley';
requireWesleyVersion(wesley);
if (process.argv.includes('--check')) {
  checkFixture(wesley);
} else {
  generateFixture(wesley);
}
