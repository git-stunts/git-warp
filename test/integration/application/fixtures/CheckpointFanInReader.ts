import { Runtime } from '../../../../index.ts';
import { createObserver, reading } from '../../../../advanced.ts';

const [directory, expected] = process.argv.slice(2);
if (!directory || !expected) { throw new Error('Checkpoint reader requires a repository and expected value'); }
const runtime = await Runtime.open({ at: directory, writer: 'reader' });
try {
  const lane = await runtime.lane('L');
  const observer = createObserver('fan-in-value', reading.property({ subject: 'n', key: 'value' }), value => value);
  const answer = await lane.observe(observer).one();
  if (answer.value !== expected) { throw new Error(`Expected ${expected}, received ${String(answer.value)}`); }
} finally { await runtime.close(); }
