import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitV19VocabularyArtifacts } from './V19VocabularyArtifacts.ts';
import { readV19VocabularyContract } from './V19VocabularyContract.ts';

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const root = resolve(SCRIPT_DIRECTORY, '..');
const contract = readV19VocabularyContract(
  resolve(root, 'schemas/v19-public-vocabulary.wesley.generated.json'),
);

emitV19VocabularyArtifacts({
  root,
  contract,
  mode: process.argv.includes('--check') ? 'check' : 'write',
});
