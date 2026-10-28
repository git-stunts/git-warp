import QueryError from '../../errors/QueryError.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import type ConeNeighbourhood from '../cone/ConeNeighbourhood.ts';
import type ConeNodeRecord from '../cone/ConeNodeRecord.ts';
import ConePluralityReader from '../cone/ConePluralityReader.ts';
import type { Plurality } from '../../api/Plurality.ts';
import type { Direction } from '../../../ports/NeighborProviderPort.ts';
import type ConeReadBasisSource from '../cone/ConeReadBasisSource.ts';
import type ConeRecordKey from '../cone/ConeRecordKey.ts';
import { hydrateConeState } from '../cone/ConeStateHydration.ts';
import { NODE_PROPERTY_CLEAR_SEMANTICS } from '../state/NodeLifecycle.ts';
import CheckpointTailTraversalReader, { type TraversalNeighborhoodReadResult } from './CheckpointTailTraversalReader.ts';
import ConeNeighborhoodPage from './ConeNeighborhoodPage.ts';
import ConeReadIdentity from './ConeReadIdentity.ts';
import NeighborhoodOpticReadResult from './NeighborhoodOpticReadResult.ts';
import type { NeighborhoodOpticReadOptions } from './NeighborhoodOptic.ts';
import NodeOpticReadResult from './NodeOpticReadResult.ts';
import NodePropertyOpticReadResult from './NodePropertyOpticReadResult.ts';
import Optic from './Optic.ts';
import { normalizeDirection, normalizeLabels, requireExecutableTraversalSupport } from './OpticReadPreconditions.ts';
import type { OpticKindValue } from './OpticReadTarget.ts';
import OpticWitnessLocator from './OpticWitnessLocator.ts';
import type TraversalOpticReadResult from './TraversalOpticReadResult.ts';
import type { TraversalOpticReadOptions } from './TraversalOptic.ts';

const REDUCER_VERSION = `cone-records/${NODE_PROPERTY_CLEAR_SEMANTICS}`;
const PROJECTION_VERSION = 'optic-read-foundation';

/** A neighbourhood page with the identity of the records it was read from. */
type ConeNeighborhoodRead = TraversalNeighborhoodReadResult & {
  readonly direction: NeighborhoodOpticReadResult['direction'];
  readonly plurality: readonly Plurality[];
};

/**
 * Answers public optic reads from a lane's cone records (#1039).
 *
 * A node or property read loads the node's one record; a neighbourhood read
 * loads the node, its adjacency pages, its incident edges and their other
 * endpoints, so its cost follows the node's degree, never the graph or its
 * history. A traversal pins one basis and reads one neighbourhood per hop
 * under the optic's explicit limits; unbounded discovery stays refused.
 */
export default class ConeWitnessLocator extends OpticWitnessLocator {
  readonly #worldline: string;
  readonly #source: ConeReadBasisSource;

  constructor(options: { readonly worldline: string; readonly source: ConeReadBasisSource }) {
    super();
    this.#worldline = options.worldline;
    this.#source = options.source;
    Object.freeze(this);
  }

  override async readNode(optic: Optic): Promise<NodeOpticReadResult> {
    const nodeId = requireOptic(optic, 'node').nodeId();
    const { basis, record } = await this.#nodeRecord(nodeId);
    return new NodeOpticReadResult({
      nodeId,
      alive: record.isAlive(),
      readIdentity: this.#identity(basis, { aspect: `node:${nodeId}:liveness`, records: [record.key()] }),
      plurality: present([ConePluralityReader.node(record)]),
    });
  }

  override async readNodeProperty(optic: Optic): Promise<NodePropertyOpticReadResult> {
    const target = requireOptic(optic, 'node-property');
    const nodeId = target.nodeId();
    const key = target.propertyKey();
    const { basis, record } = await this.#nodeRecord(nodeId);
    return new NodePropertyOpticReadResult({
      nodeId,
      key,
      value: visiblePropertyValue(record, key),
      readIdentity: this.#identity(basis, { aspect: `node:${nodeId}:prop:${key}`, records: [record.key()] }),
      plurality: present([ConePluralityReader.register(record, key), ConePluralityReader.node(record)]),
    });
  }

  override async readNeighborhood(optic: Optic, options: NeighborhoodOpticReadOptions): Promise<NeighborhoodOpticReadResult> {
    const nodeId = requireOptic(optic, 'neighborhood').nodeId();
    const page = await this.#neighborhoodPage(await this.#source.basis(), { ...options, nodeId });
    return new NeighborhoodOpticReadResult({
      nodeId,
      direction: page.direction,
      edges: page.edges,
      completeness: page.cursor === null ? 'complete' : 'truncated',
      cursor: page.cursor,
      readIdentity: page.readIdentity,
      plurality: page.plurality,
    });
  }

  override async readTraversal(optic: Optic, options: TraversalOpticReadOptions): Promise<TraversalOpticReadResult> {
    const startNodeId = requireOptic(optic, 'traversal').nodeId();
    requireExecutableTraversalSupport(optic, options);
    const basis = await this.#source.basis();
    const reader = new CheckpointTailTraversalReader({
      readNeighborhood: async (nodeId, readOptions) => await this.#neighborhoodPage(basis, { ...readOptions, nodeId }),
    });
    return await reader.read(startNodeId, options);
  }

  async #nodeRecord(nodeId: string): Promise<{ readonly basis: ConeBasis; readonly record: ConeNodeRecord }> {
    const basis = await this.#source.basis();
    return { basis, record: await this.#source.reader.node(basis.root, nodeId) };
  }

  async #neighborhoodPage(
    basis: ConeBasis,
    request: NeighborhoodOpticReadOptions & { readonly nodeId: string },
  ): Promise<ConeNeighborhoodRead> {
    const direction = normalizeDirection(request.direction);
    const labels = normalizeLabels(request.labels ?? []);
    const neighbourhood = await this.#source.reader.neighbourhoodRecords(basis.root, request.nodeId);
    const page = ConeNeighborhoodPage.read(neighbourhood, {
      nodeId: request.nodeId, direction, labels, limit: request.limit, cursor: request.cursor,
    });
    const aspect = `node:${request.nodeId}:neighborhood:${direction}:${labelsAspect(labels)}`;
    return Object.freeze({
      direction,
      edges: page.edges,
      cursor: page.cursor,
      resumeCursors: page.resumeCursors,
      readIdentity: this.#identity(basis, { aspect, records: neighbourhood.recordKeys() }),
      plurality: request.cursor === undefined || request.cursor.length === 0
        ? edgePluralities(neighbourhood, { nodeId: request.nodeId, direction, labels }) : [],
    });
  }

  #identity(basis: ConeBasis, read: { readonly aspect: string; readonly records: readonly ConeRecordKey[] }): ConeReadIdentity {
    return new ConeReadIdentity({
      worldline: this.#worldline,
      entityAspect: read.aspect,
      basis,
      records: read.records,
      reducerVersion: REDUCER_VERSION,
      projectionVersion: PROJECTION_VERSION,
    });
  }
}

/** The node's register value when the node is alive and no clear of it postdates the register. */
function visiblePropertyValue(record: ConeNodeRecord, key: string): PropValue | undefined {
  const register = record.props.get(key);
  if (register === undefined || !record.isAlive()) {
    return undefined;
  }
  return hydrateConeState([record], []).isStaleNodeRegister(record.nodeId, register) ? undefined : register.value;
}

/** Delete-versus-edit pluralities of the node's incident edges in the read's direction and labels. */
function edgePluralities(
  neighbourhood: ConeNeighbourhood,
  scope: { readonly nodeId: string; readonly direction: Direction; readonly labels: readonly string[] },
): Plurality[] {
  return present(neighbourhood.edges.filter((edge) => inReadScope(edge, scope)).map((edge) => ConePluralityReader.edge(edge)));
}

function inReadScope(
  edge: { readonly from: string; readonly to: string; readonly label: string },
  scope: { readonly nodeId: string; readonly direction: Direction; readonly labels: readonly string[] },
): boolean {
  const labelled = scope.labels.length === 0 || scope.labels.includes(edge.label);
  return labelled && (incidentAs(edge.from, 'out', scope) || incidentAs(edge.to, 'in', scope));
}

function incidentAs(endpoint: string, direction: 'out' | 'in', scope: { readonly nodeId: string; readonly direction: Direction }): boolean {
  return endpoint === scope.nodeId && (scope.direction === 'both' || scope.direction === direction);
}

function present(pluralities: ReadonlyArray<Plurality | null>): Plurality[] {
  return pluralities.flatMap((plurality) => (plurality === null ? [] : [plurality]));
}

function labelsAspect(labels: readonly string[]): string {
  if (labels.length === 0) {
    return 'labels:*';
  }
  return `labels:${labels.map((label) => `${label.length}:${label}`).join('|')}`;
}

function requireOptic(optic: Optic, opticKind: OpticKindValue): Optic {
  if (!(optic instanceof Optic) || optic.target.opticKind !== opticKind) {
    throw new QueryError('Cone read requires a matching Optic.', {
      code: 'E_OPTIC_SCHEMA',
      context: { expectedOpticKind: opticKind },
    });
  }
  return optic;
}
