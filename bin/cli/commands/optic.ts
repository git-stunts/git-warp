import { openWarpWorldline } from '../../../index.ts';
import QueryError from '../../../src/domain/errors/QueryError.ts';
import type ReadIdentity from '../../../src/domain/services/optic/ReadIdentity.ts';
import type WorldlineOptic from '../../../src/domain/services/optic/WorldlineOptic.ts';
import type NodeOpticReadResult from '../../../src/domain/services/optic/NodeOpticReadResult.ts';
import type NodePropertyOpticReadResult from '../../../src/domain/services/optic/NodePropertyOpticReadResult.ts';
import WebCryptoAdapter from '../../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import { EXIT_CODES, notFoundError, parseCommandArgs, usageError } from '../infrastructure.ts';
import { opticWitnessSchema } from '../schemas.ts';
import { createPersistence, listGraphNames, resolveGraphName } from '../shared.ts';
import type { CliOptions, Persistence } from '../types.ts';

const OPTIC_WITNESS_OPTIONS = {
  property: { type: 'string' },
};

type OpticWitnessSelection = {
  readonly nodeId: string;
  readonly propertyKey: string | null;
};

type OpticWitnessResult = NodeOpticReadResult | NodePropertyOpticReadResult;

type OpticCommandResult = {
  readonly payload: unknown;
  readonly exitCode: number;
};

type OpticBasisEvidence = {
  readonly basisId: string;
  readonly checkpointSha: string;
};

export default async function handleOptic({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<OpticCommandResult> {
  const selection = parseOpticWitnessArgs(args);
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveOpticGraphName(persistence, options.graph);
  const worldline = await openWarpWorldline({
    persistence,
    worldlineName: graphName,
    writerId: options.writer,
    crypto: new WebCryptoAdapter(),
  });
  let basisEvidence: OpticBasisEvidence | null = null;

  try {
    const basis = await worldline.prepareOpticBasis();
    basisEvidence = {
      basisId: `checkpoint-tail:${graphName}:${basis.checkpointSha}`,
      checkpointSha: basis.checkpointSha,
    };
    const coordinate = await worldline.coordinate();
    const result = await readSelection(coordinate.optic(), selection);
    return {
      payload: witnessPayload({
        graphName,
        basis: basisEvidence,
        result,
        selection,
      }),
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    if (error instanceof QueryError) {
      return {
        payload: obstructedWitnessPayload({
          graphName,
          basis: basisEvidence,
          selection,
          error,
        }),
        exitCode: EXIT_CODES.INTERNAL,
      };
    }
    throw error;
  }
}

function parseOpticWitnessArgs(args: readonly string[]): OpticWitnessSelection {
  const subcommand = args[0];
  if (subcommand !== 'witness') {
    throw usageError('optic requires subcommand: witness');
  }
  const { values, positionals } = parseCommandArgs(
    args.slice(1),
    OPTIC_WITNESS_OPTIONS,
    opticWitnessSchema,
    { allowPositionals: true },
  );
  const nodeId = positionals[0];
  if (nodeId === undefined || nodeId.length === 0) {
    throw usageError('optic witness requires a node id');
  }
  if (positionals.length > 1) {
    throw usageError('optic witness accepts exactly one node id');
  }
  return { nodeId, propertyKey: values.propertyKey };
}

async function resolveOpticGraphName(
  persistence: Persistence,
  graph: string | null,
): Promise<string> {
  const graphName = await resolveGraphName(persistence, graph);
  if (typeof graph === 'string' && graph.length > 0) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(graph)) {
      throw notFoundError(`Graph not found: ${graph}`);
    }
  }
  return graphName;
}

async function readSelection(
  optic: WorldlineOptic,
  selection: OpticWitnessSelection,
): Promise<OpticWitnessResult> {
  const node = optic.node(selection.nodeId);
  if (selection.propertyKey === null) {
    return await node.read();
  }
  return await node.prop(selection.propertyKey).read();
}

function witnessPayload(options: {
  readonly graphName: string;
  readonly basis: OpticBasisEvidence;
  readonly result: OpticWitnessResult;
  readonly selection: OpticWitnessSelection;
}): object {
  const readIdentity = options.result.readIdentity;
  return {
    command: 'optic witness',
    graph: options.graphName,
    selection: selectionPayload(options.selection),
    basisId: options.basis.basisId,
    checkpointSha: options.basis.checkpointSha,
    completeness: 'complete',
    obstruction: null,
    read: readPayload(options.result),
    evidence: evidencePayload(readIdentity),
    readIdentity,
  };
}

function obstructedWitnessPayload(options: {
  readonly graphName: string;
  readonly basis: OpticBasisEvidence | null;
  readonly selection: OpticWitnessSelection;
  readonly error: QueryError;
}): object {
  return {
    command: 'optic witness',
    graph: options.graphName,
    selection: selectionPayload(options.selection),
    basisId: options.basis?.basisId ?? null,
    checkpointSha: options.basis?.checkpointSha ?? null,
    completeness: 'obstructed',
    obstruction: {
      code: options.error.code,
      message: options.error.message,
      context: options.error.context,
    },
    read: null,
    evidence: {
      touchedShardIds: [],
      tailWitnessRange: {
        count: 0,
        first: null,
        last: null,
      },
      tailWitnesses: [],
    },
  };
}

function selectionPayload(selection: OpticWitnessSelection): object {
  return {
    nodeId: selection.nodeId,
    propertyKey: selection.propertyKey,
  };
}

function readPayload(result: OpticWitnessResult): object {
  if ('key' in result) {
    return {
      kind: 'node-property',
      nodeId: result.nodeId,
      key: result.key,
      exists: result.exists,
      value: result.value,
    };
  }
  return {
    kind: 'node',
    nodeId: result.nodeId,
    alive: result.alive,
  };
}

function evidencePayload(readIdentity: ReadIdentity): object {
  return {
    touchedShardIds: readIdentity.checkpointIndexShards,
    tailWitnessRange: tailWitnessRange(readIdentity),
    tailWitnesses: readIdentity.tailWitnesses,
  };
}

function tailWitnessRange(readIdentity: ReadIdentity): object {
  const witnesses = readIdentity.tailWitnesses;
  const first = witnesses[0] ?? null;
  const last = witnesses[witnesses.length - 1] ?? null;
  return {
    count: witnesses.length,
    first,
    last,
  };
}
