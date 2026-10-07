import { Runtime } from '../../../../index.ts';
import { createObserver, intent, reading } from '../../../../advanced.ts';

const SEED_WRITES = 20;
const SUBJECT = 'n';
const PROPERTY = 'value';
const [repository, writer, mode, expected] = process.argv.slice(2);
if (!repository || !writer || !expected) {
  throw new Error('Observed writer fixture requires repository, writer, mode, and expected value');
}
if (mode !== 'seed' && mode !== 'observe' && mode !== 'write') {
  throw new Error('Observed writer fixture mode is unsupported');
}
const runtime = await Runtime.open({ at: repository, writer });
try {
  const lane = await runtime.lane('L');
  if (mode === 'seed') {
    await lane.write(intent.node.add({ subject: SUBJECT }));
    for (let index = 0; index < SEED_WRITES; index += 1) {
      const receipt = await lane.write(intent.property.set({
        subject: SUBJECT, key: PROPERTY, value: `A${index}`,
      }));
      if (receipt.outcome.kind !== 'derived') {
        throw new Error('Seed write was not admitted');
      }
    }
  } else if (mode === 'write') {
    const receipt = await lane.write(intent.property.set({
      subject: SUBJECT, key: PROPERTY, value: expected,
    }));
    if (receipt.outcome.kind !== 'derived') {
      throw new Error('Observed writer was not admitted');
    }
  } else {
    const observer = createObserver('observed-value', reading.property({
      subject: SUBJECT, key: PROPERTY,
    }), (value) => value);
    const answer = await lane.observe(observer).one();
    if (answer.value !== expected) {
      throw new Error(`Expected ${expected}, received ${String(answer.value)}`);
    }
  }
} finally {
  await runtime.close();
}
