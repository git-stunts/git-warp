import CheckpointTailBasisLoader, {
  type CheckpointTailIndexBasis,
} from './CheckpointTailBasisLoader.ts';
import CheckpointShardFactReader from './CheckpointShardFactReader.ts';
import CheckpointTailFactReducer from './CheckpointTailFactReducer.ts';
import CheckpointTailReadFailure from './CheckpointTailReadFailure.ts';
import CheckpointTailReadIdentityBuilder from './CheckpointTailReadIdentityBuilder.ts';
import QueryError from '../../errors/QueryError.ts';
import NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import CheckpointTailWitnessScan, { type TailWitnessScan } from './CheckpointTailWitnessScan.ts';

const DEFAULT_MAX_TAIL_PATCHES = 10_000;

export default class CheckpointTailWitnessLocator {
  private readonly _graphName: string;
  private readonly _basisLoader: CheckpointTailBasisLoader;
  private readonly _shardReader: CheckpointShardFactReader;
  private readonly _factReducer: CheckpointTailFactReducer;
  private readonly _readIdentityBuilder: CheckpointTailReadIdentityBuilder;
  private readonly _tailScan: CheckpointTailWitnessScan;

  constructor(options: {
    readonly source: CheckpointTailOpticSource;
    readonly maxTailPatches?: number;
  }) {
    this._graphName = options.source.graphName;
    this._basisLoader = new CheckpointTailBasisLoader({ source: options.source });
    this._shardReader = new CheckpointShardFactReader({ source: options.source });
    this._factReducer = new CheckpointTailFactReducer({ graphName: options.source.graphName });
    this._readIdentityBuilder = new CheckpointTailReadIdentityBuilder({
      worldline: options.source.graphName,
    });
    this._tailScan = new CheckpointTailWitnessScan({
      source: options.source,
      maxTailPatches: options.maxTailPatches ?? DEFAULT_MAX_TAIL_PATCHES,
    });
    Object.freeze(this);
  }

  async readNode(nodeId: string): Promise<NodeOpticReadResult> {
    try {
      return await this._readNodeResult(nodeId);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'node',
          nodeId,
        }).enrich(error);
      }
      throw error;
    }
  }

  async readNodeProperty(
    nodeId: string,
    propertyKey: string,
  ): Promise<NodePropertyOpticReadResult> {
    try {
      return await this._readNodePropertyResult(nodeId, propertyKey);
    } catch (error) {
      if (error instanceof QueryError) {
        throw new CheckpointTailReadFailure({
          graphName: this._graphName,
          opticKind: 'node-property',
          nodeId,
          propertyKey,
        }).enrich(error);
      }
      throw error;
    }
  }

  private async _readNodeResult(nodeId: string): Promise<NodeOpticReadResult> {
    const basis = await this._basisLoader.load();
    const baseAlive = await this._shardReader.readNodeAlive(basis, nodeId);
    const tail = await this._scanTailForNode(basis, nodeId);
    const alive = this._factReducer.reduceNodeLiveness(baseAlive, tail.entries, nodeId);
    return new NodeOpticReadResult({
      nodeId,
      alive,
      readIdentity: this._readIdentityBuilder.nodeLiveness({
        basis,
        nodeId,
        checkpointIndexShards: this._shardReader.nodeLivenessShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _readNodePropertyResult(
    nodeId: string,
    propertyKey: string,
  ): Promise<NodePropertyOpticReadResult> {
    const basis = await this._basisLoader.load();
    const baseValue = await this._shardReader.readProperty(basis, nodeId, propertyKey);
    const tail = await this._scanTailForProperty(basis, nodeId, propertyKey);
    const value = this._factReducer.reduceProperty({
      baseValue,
      tailEntries: tail.entries,
      nodeId,
      propertyKey,
    });
    return new NodePropertyOpticReadResult({
      nodeId,
      key: propertyKey,
      value,
      readIdentity: this._readIdentityBuilder.nodeProperty({
        basis,
        nodeId,
        propertyKey,
        checkpointIndexShards: this._shardReader.propertyShardIdentities(basis, nodeId),
        tailWitnesses: tail.witnesses,
      }),
    });
  }

  private async _scanTailForNode(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => this._factReducer.includesNodeLiveness(entry, nodeId),
    });
  }

  private async _scanTailForProperty(
    basis: CheckpointTailIndexBasis,
    nodeId: string,
    propertyKey: string,
  ): Promise<TailWitnessScan> {
    return await this._tailScan.collect({
      basis,
      includeEntry: (entry) => this._factReducer.includesProperty(entry, nodeId, propertyKey),
    });
  }
}
