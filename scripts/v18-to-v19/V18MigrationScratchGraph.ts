import Plumbing from '@git-stunts/plumbing';

import WarpCore from '../../src/domain/WarpCore.ts';
import GitCasRepositoryAdapter from '../../src/infrastructure/adapters/GitCasRepositoryAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import defaultCodec from '../../src/infrastructure/codecs/CborCodec.ts';

export async function openScratchGraph(
  repositoryPath: string,
  graph: string,
  writer: string,
): Promise<Readonly<{
  close(): Promise<void>;
  graph: Awaited<ReturnType<typeof WarpCore.open>>;
}>> {
  const plumbing = await Plumbing.createDefault({ cwd: repositoryPath });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  const storage = new GitCasRepositoryAdapter({ plumbing, history });
  try {
    const graphRuntime = await WarpCore.open({
      runtimeStorage: storage,
      stateCache: null,
      persistence: history,
      graphName: graph,
      writerId: writer,
      codec: defaultCodec,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
      crypto: new WebCryptoAdapter(),
    });
    return Object.freeze({
      graph: graphRuntime,
      async close(): Promise<void> {
        try {
          await storage.close();
        } finally {
          await history.close();
        }
      },
    });
  } catch (error) {
    try {
      await storage.close();
    } finally {
      await history.close();
    }
    throw error;
  }
}
