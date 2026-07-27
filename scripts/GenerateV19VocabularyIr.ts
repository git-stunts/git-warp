import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIRECTORY, '..');
const SCHEMA_PATH = resolve(
  ROOT,
  'schemas/v19-public-vocabulary.graphql',
);
const OUTPUT_PATH = resolve(
  ROOT,
  'schemas/v19-public-vocabulary.wesley.generated.json',
);

class VocabularyIrDriftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VocabularyIrDriftError';
  }
}

class VocabularyIrUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VocabularyIrUsageError';
  }
}

function wesleyBinary(): string {
  const index = process.argv.indexOf('--wesley');
  if (index === -1) {
    return 'wesley';
  }
  const binary = process.argv[index + 1];
  if (binary === undefined || binary.startsWith('--')) {
    throw new VocabularyIrUsageError('--wesley requires an executable path');
  }
  return binary;
}

function lowerVocabularySchema(binary: string): string {
  const output = execFileSync(
    binary,
    ['schema', 'lower', '--schema', SCHEMA_PATH, '--json'],
    { encoding: 'utf8' },
  );
  return output.endsWith('\n') ? output : `${output}\n`;
}

const rendered = lowerVocabularySchema(wesleyBinary());
if (process.argv.includes('--check')) {
  if (!existsSync(OUTPUT_PATH)) {
    throw new VocabularyIrDriftError(
      'v19 vocabulary IR is missing; run npm run generate:vocabulary-ir',
    );
  }
  if (readFileSync(OUTPUT_PATH, 'utf8') !== rendered) {
    throw new VocabularyIrDriftError(
      'v19 vocabulary IR drifted; run npm run generate:vocabulary-ir',
    );
  }
} else {
  writeFileSync(OUTPUT_PATH, rendered);
}
