import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import ObservationAttemptId from '../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationBindings from '../../../src/domain/services/custody/ObservationBindings.ts';
import ObservationBudget from '../../../src/domain/services/custody/ObservationBudget.ts';
import ObservationDependencyClaim from '../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationDigest from '../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationPreparation from '../../../src/domain/services/custody/ObservationPreparation.ts';
import ObservationQuestion from '../../../src/domain/services/custody/ObservationQuestion.ts';
import ObservationWritePremise from '../../../src/domain/services/custody/ObservationWritePremise.ts';
import WriteAttemptRecord from '../../../src/domain/services/write/WriteAttemptRecord.ts';
import WritePublicationProbe, { PUBLICATION_PROBE_WINDOW } from '../../../src/domain/services/write/WritePublicationProbe.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import GitWritePublicationHistoryAdapter from '../../../src/infrastructure/adapters/GitWritePublicationHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';

const WRITER_REF = 'refs/warp/g/writers/alice';
/** Commits on the writer's chain: well past what one probe reads. */
const CHAIN_LENGTH = 2 * PUBLICATION_PROBE_WINDOW;
const CASE_TIMEOUT_MS = 120_000;
/** A probe reads the writer ref, lists the range once and reads one commit. */
const PROBE_PROCESS_CEILING = 3;

type Chain = { readonly plumbing: Plumbing; readonly history: GitTimelineHistoryAdapter; readonly shas: readonly string[] };

/** One fast-import builds the whole linear chain; `shas[depth]` is the commit `depth` behind the tip. */
async function deepChain(): Promise<Chain> {
  const directory = await mkdtemp(join(tmpdir(), 'publication-probe-'));
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init', '--quiet'] });
  const commands = Array.from({ length: CHAIN_LENGTH }, (_, index) => [
    `commit ${WRITER_REF}`, `mark :${index + 1}`, `committer Probe <probe@example.invalid> ${index} +0000`,
    'data 9', `c${String(index).padStart(8, '0')}`, ...(index === 0 ? [] : [`from :${index}`]), '',
  ].join('\n'));
  await plumbing.execute({ args: ['fast-import', '--quiet'], input: `${commands.join('\n')}\n` });
  const listed = await plumbing.execute({ args: ['rev-list', '--first-parent', WRITER_REF] });
  return { plumbing, history: new GitTimelineHistoryAdapter({ plumbing }), shas: listed.trim().split('\n') };
}

function recordAfter(predecessor: string): WriteAttemptRecord {
  const writePremise = new ObservationWritePremise({ intents: new ObservationDigest('b'.repeat(64)), writerId: 'alice', predecessor });
  return new WriteAttemptRecord({
    preparation: new ObservationPreparation(new ObservationAttemptId('a'.repeat(32)), new ObservationBindings({
      basis: 'c'.repeat(40), observer: 'writer:alice', question: new ObservationQuestion('q', 1), purpose: 'p',
      budget: new ObservationBudget({ records: 1, bytes: 1, work: 1 }), evidence: [],
      dependencies: ObservationDependencyClaim.NONE, writePremise,
    })),
    admission: 'derived', occurrences: [], savedAt: 1,
  });
}

describe('WritePublicationProbe over a deep Git chain (#1075)', () => {
  let chain: Chain;

  beforeAll(async () => {
    chain = await deepChain();
  }, CASE_TIMEOUT_MS);

  async function processesFor(predecessor: string): Promise<{ readonly found: object; readonly processes: number }> {
    const execute = vi.spyOn(chain.plumbing, 'execute');
    const probe = new WritePublicationProbe({
      graph: 'g', history: new GitWritePublicationHistoryAdapter(chain.history), messages: DEFAULT_COMMIT_MESSAGE_CODEC,
    });
    const found = await probe.locate(recordAfter(predecessor));
    const processes = execute.mock.calls.length;
    execute.mockRestore();
    return { found, processes };
  }

  it('builds the chain it claims', () => {
    expect(chain.shas).toHaveLength(CHAIN_LENGTH);
  });

  it('settles a predecessor at the window edge in a bounded number of Git processes', async () => {
    const { found, processes } = await processesFor(chain.shas[PUBLICATION_PROBE_WINDOW] ?? '');

    expect(found).toEqual({ kind: 'other' });
    expect(processes).toBeLessThanOrEqual(PROBE_PROCESS_CEILING);
  }, CASE_TIMEOUT_MS);

  it('calls a predecessor past the window out of reach in a bounded number of Git processes', async () => {
    const { found, processes } = await processesFor(chain.shas[CHAIN_LENGTH - 1] ?? '');

    expect(found).toEqual({ kind: 'exhausted' });
    expect(processes).toBeLessThanOrEqual(PROBE_PROCESS_CEILING);
  }, CASE_TIMEOUT_MS);
});
