import { GitStorage, RetainedWriteReceipt, Warp, WarpAccessDenied, WarpAccessPort, WarpAddress, WarpWriteGrant } from '../../index.ts';
import type { ContentMetadataInput, StagedContent, WarpWriteRequest, WriteIntentInput } from '../../index.ts';

const SEED_BUDGET = { records: 4096, bytes: 16 * 1024 * 1024, work: 1_000_000 };

/** Grants every writer: tests seed a graph and then read it through the legacy Runtime read path. */
class SeedAccess extends WarpAccessPort {
  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({ authority: `seed:${request.writer}`, budget: SEED_BUDGET }));
  }
}

export type SeedText = Readonly<{ readonly content: string; readonly metadata?: ContentMetadataInput }>;

/** Writes `input` as `writer` through the public `Warp` and requires a retained receipt. */
export async function writeThroughWarp(
  at: string,
  graph: string,
  writer: string,
  input: WriteIntentInput,
): Promise<RetainedWriteReceipt> {
  return await writeStagedThroughWarp(at, graph, writer, [], () => input);
}

/** Stages `texts` on one Warp, then writes what `build` makes of them, as `writer`. */
export async function writeStagedThroughWarp(
  at: string,
  graph: string,
  writer: string,
  texts: readonly SeedText[],
  build: (staged: readonly StagedContent[]) => WriteIntentInput,
): Promise<RetainedWriteReceipt> {
  const warp = await Warp.open(WarpAddress.of(GitStorage.at(at), graph), new SeedAccess());
  try {
    const authored = warp.as(writer);
    const staged: StagedContent[] = [];
    for (const text of texts) {
      const result = await authored.stage(text.content, text.metadata);
      if (result instanceof WarpAccessDenied) {
        throw new Error(`seed staging was denied: ${result.cause}`);
      }
      staged.push(result);
    }
    const receipt = await authored.execute(build(staged));
    if (!(receipt instanceof RetainedWriteReceipt)) {
      throw new Error(`seed write was not retained: ${receipt.constructor.name}`);
    }
    return receipt;
  } finally {
    await warp.close();
  }
}

/** The subject the `index`th `entity.add` intent of a seed write admitted. */
export function admittedSubject(receipt: RetainedWriteReceipt, index = 0): string {
  const occurrence = receipt.occurrences.find(({ intentIndex }) => intentIndex === index);
  if (occurrence === undefined) {
    throw new Error(`seed write admitted no entity at intent ${String(index)}`);
  }
  return occurrence.subject;
}
