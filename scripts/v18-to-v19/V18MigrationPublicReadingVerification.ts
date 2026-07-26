import Runtime from '../../src/application/Runtime.ts';
import { createObserver } from '../../src/domain/api/ObserverRuntime.ts';
import Reading from '../../src/domain/api/Reading.ts';
import { openScratchGraph } from './V18MigrationScratchGraph.ts';

export const V18_MIGRATION_VERIFICATION_WRITER = 'v19-migration-verifier';
const VERIFICATION_NODE = 'migration:verification';
const VERIFICATION_KEY = 'status';
const VERIFICATION_VALUE = 'v19-ready';

export async function appendAndVerifyV18MigrationReading(
  repositoryPath: string,
  graph: string,
): Promise<void> {
  const opened = await openScratchGraph(
    repositoryPath,
    graph,
    V18_MIGRATION_VERIFICATION_WRITER,
  );
  try {
    await opened.graph.patch((patch) => {
      patch
        .addNode(VERIFICATION_NODE)
        .setProperty(VERIFICATION_NODE, VERIFICATION_KEY, VERIFICATION_VALUE);
    });
  } finally {
    await opened.close();
  }
  const runtime = await Runtime.open({
    at: repositoryPath,
    writer: V18_MIGRATION_VERIFICATION_WRITER,
  });
  try {
    const lane = await runtime.lane(graph);
    const observation = lane.observe(createObserver<string>(
      'v18-to-v19.verification',
      Reading.property({ subject: VERIFICATION_NODE, key: VERIFICATION_KEY }),
      (value) => {
        if (typeof value !== 'string') {
          throw new TypeError('migration verification property must be a string');
        }
        return value;
      },
    ));
    const result = await observation.one();
    if (result.value !== VERIFICATION_VALUE) {
      throw new Error('v19 public reading did not observe the verification append');
    }
    const receipt = await observation.receipt;
    if (receipt.status !== 'completed') {
      throw new Error(`v19 public reading receipt is ${receipt.status}`);
    }
  } finally {
    await runtime.close();
  }
}
