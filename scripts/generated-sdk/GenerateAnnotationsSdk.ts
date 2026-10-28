import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Two-stage generation of the annotations example SDK.
 *
 * Stage one: `wesley emit typescript` preserves annotations.graphql as request
 * types and directive metadata. Stage two: RenderAnnotationsSdk.ts binds that
 * metadata to git-warp Intents and Observers. `--check` regenerates both into
 * a temporary directory and rejects byte drift.
 */

const WESLEY_VERSION = '0.3.0-alpha.1';
const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const SDK_DIRECTORY = resolve(SCRIPT_DIRECTORY, '../../examples/annotations/sdk');
const SCHEMA_PATH = join(SDK_DIRECTORY, 'annotations.graphql');
const WESLEY_OUTPUT = 'annotations.wesley.generated.ts';
const SDK_OUTPUT = 'annotations.generated.ts';
const RENDERER_PATH = join(SCRIPT_DIRECTORY, 'RenderAnnotationsSdk.ts');

class AnnotationsSdkGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnnotationsSdkGenerationError';
  }
}

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function requireWesleyVersion(wesley: string): void {
  const version = execFileSync(wesley, ['--version'], { encoding: 'utf8' }).trim();
  if (version !== WESLEY_VERSION) {
    throw new AnnotationsSdkGenerationError(`Wesley ${WESLEY_VERSION} is required; received ${version}`);
  }
}

function emitWesleyTypes(wesley: string, output: string): void {
  execFileSync(wesley, ['emit', 'typescript', '--schema', SCHEMA_PATH, '--out', output], { stdio: 'inherit' });
}

function renderSdk(output: string): void {
  execFileSync(process.execPath, [RENDERER_PATH, '--out', output], { stdio: 'inherit' });
}

function requireMatchingFile(expectedPath: string, generatedPath: string): void {
  if (!readFileSync(expectedPath).equals(readFileSync(generatedPath))) {
    throw new AnnotationsSdkGenerationError(`${expectedPath} has drifted; run npm run generate:annotations-sdk`);
  }
}

function checkSdk(wesley: string): void {
  const temporary = mkdtempSync(join(tmpdir(), 'git-warp-annotations-sdk-'));
  try {
    emitWesleyTypes(wesley, join(temporary, WESLEY_OUTPUT));
    requireMatchingFile(join(SDK_DIRECTORY, WESLEY_OUTPUT), join(temporary, WESLEY_OUTPUT));
    // The renderer reads the checked-in Wesley output, which the line above proved current.
    renderSdk(join(temporary, SDK_OUTPUT));
    requireMatchingFile(join(SDK_DIRECTORY, SDK_OUTPUT), join(temporary, SDK_OUTPUT));
  } finally {
    rmSync(temporary, { force: true, recursive: true });
  }
}

const wesley = argumentValue('--wesley') ?? 'wesley';
requireWesleyVersion(wesley);
if (process.argv.includes('--check')) {
  checkSdk(wesley);
} else {
  emitWesleyTypes(wesley, join(SDK_DIRECTORY, WESLEY_OUTPUT));
  renderSdk(join(SDK_DIRECTORY, SDK_OUTPUT));
}
