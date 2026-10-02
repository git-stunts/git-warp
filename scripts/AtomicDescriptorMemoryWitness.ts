import './RequireDockerTests.ts';
import { spawnSync } from 'node:child_process';
import Intent from '../src/domain/api/Intent.ts';
import IntentSequence from '../src/domain/api/IntentSequence.ts';
import WarpError from '../src/domain/errors/WarpError.ts';
import { canonicalStringify } from '../src/domain/utils/canonicalStringify.ts';
import { textEncode } from '../src/domain/utils/bytes.ts';

const HEAP_MIB = 32;
const INPUT_CHARACTERS = 8 * 1024 * 1024;

function worker(mode: string): void {
  const requested = Intent.setProperty({ subject: 'n', key: 'p', value: '\u0000'.repeat(INPUT_CHARACTERS) });
  console.log(`inputCharacters=${String(INPUT_CHARACTERS)} heapLimitMiB=${String(HEAP_MIB)} mode=${mode}`);
  if (mode === 'eager') {
    // Controlled reconstruction of the previous guard: full encoding precedes refusal.
    textEncode(canonicalStringify({ kind: 'intent.sequence', intents: [requested.descriptor] }));
    throw new Error('Eager negative control unexpectedly survived the heap cap');
  }
  try {
    IntentSequence.from([requested]);
    throw new Error('Oversized request unexpectedly admitted');
  } catch (error) {
    if (!(error instanceof WarpError) || error.code !== 'E_INTENT_SEQUENCE_SIZE') { throw error; }
    console.log(`boundedRefusal=${error.code} maxRssKiB=${String(process.resourceUsage().maxRSS)}`);
  }
}

function main(): void {
  for (const mode of ['bounded', 'eager']) {
    const result = spawnSync(process.execPath, [`--max-old-space-size=${String(HEAP_MIB)}`, process.argv[1] ?? '', mode], {
      encoding: 'utf8', maxBuffer: 1024 * 1024,
    });
    console.log(result.stdout.trim());
    console.log(`mode=${mode} exit=${String(result.status)} signal=${String(result.signal)}`);
    if (mode === 'bounded' && result.status !== 0) { throw new Error(result.stderr); }
    if (mode === 'eager' && !result.stderr.includes('heap out of memory')) {
      throw new Error(`Negative control did not demonstrate allocation failure: ${result.stderr}`);
    }
  }
}

const mode = process.argv[2];
if (mode === undefined) { main(); } else { worker(mode); }
