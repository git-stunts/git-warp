import type PatchCollector from '../../capabilities/PatchCollector.ts';
import WarpError from '../../errors/WarpError.ts';
import type MaterializationHandle from '../../materialization/MaterializationHandle.ts';
import type { PropValue } from '../../types/PropValue.ts';
import type MaterializationReadPort from '../../../ports/MaterializationReadPort.ts';
import type { MaterializationEdgeTarget } from '../../../ports/MaterializationReadPort.ts';
import { isLegacyEdgePropertyProjectionTarget } from '../LegacyPropertyProjectionTarget.ts';
import { replayTargetedEdgeProperties } from './TargetedEdgePropertyReplay.ts';
import { replayTargetedNodeProperties } from './TargetedNodePropertyReplay.ts';

export async function readMaterializedNodePresence(options: {
  readonly materialization: MaterializationHandle | null;
  readonly nodeId: string;
  readonly reader: MaterializationReadPort;
}): Promise<boolean | null> {
  const { materialization, nodeId, reader } = options;
  if (materialization === null) {
    return false;
  }
  const root = materialization.roots.nodeAlive;
  if (root.status === 'unavailable') {
    return null;
  }
  if (root.status === 'empty') {
    return false;
  }
  if (root.handle === null) {
    throw liveReadError('retained node-liveness root has no handle');
  }
  return await reader.hasNode(root.handle, nodeId);
}

export async function readMaterializedNodeProperties(options: {
  readonly materialization: MaterializationHandle | null;
  readonly nodeId: string;
  readonly patches: PatchCollector;
  readonly reader: MaterializationReadPort;
}): Promise<Readonly<Record<string, PropValue>> | null | undefined> {
  const { materialization, nodeId, patches, reader } = options;
  if (materialization === null) {
    return null;
  }
  const presence = await readMaterializedNodePresence({
    materialization,
    nodeId,
    reader,
  });
  if (presence !== true) {
    return propertyReadUnavailable(presence);
  }
  const retained = await readPropertiesRoot(reader, materialization, nodeId);
  if (retained !== undefined) {
    return retained;
  }
  return await replayTargetedNodeProperties({
    coordinate: materialization.coordinate,
    nodeId,
    patches,
  });
}

export async function readMaterializedEdgeProperties(options: {
  readonly edge: MaterializationEdgeTarget;
  readonly materialization: MaterializationHandle | null;
  readonly patches: PatchCollector;
  readonly reader: MaterializationReadPort;
}): Promise<Readonly<Record<string, PropValue>> | null | undefined> {
  const { edge, materialization, patches, reader } = options;
  if (!isLegacyEdgePropertyProjectionTarget(edge) || materialization === null) {
    return null;
  }
  const presence = await readVisibleEdgePresence({
    edge,
    materialization,
    reader,
  });
  if (presence !== true) {
    return propertyReadUnavailable(presence);
  }
  return await replayTargetedEdgeProperties({
    coordinate: materialization.coordinate,
    edge,
    patches,
  });
}

async function readVisibleEdgePresence(options: {
  readonly edge: MaterializationEdgeTarget;
  readonly materialization: MaterializationHandle;
  readonly reader: MaterializationReadPort;
}): Promise<boolean | null> {
  const { edge, materialization, reader } = options;
  const endpoints = await readEndpointPresence({
    edge,
    materialization,
    reader,
  });
  if (endpoints !== true) {
    return endpoints;
  }
  return await readEdgePresence(reader, materialization, edge);
}

async function readEndpointPresence(options: {
  readonly edge: MaterializationEdgeTarget;
  readonly materialization: MaterializationHandle;
  readonly reader: MaterializationReadPort;
}): Promise<boolean | null> {
  const { edge, materialization, reader } = options;
  const source = await readMaterializedNodePresence({
    materialization,
    nodeId: edge.from,
    reader,
  });
  if (source !== true) {
    return source;
  }
  return await readMaterializedNodePresence({
    materialization,
    nodeId: edge.to,
    reader,
  });
}

async function readEdgePresence(
  reader: MaterializationReadPort,
  materialization: MaterializationHandle,
  edge: MaterializationEdgeTarget,
): Promise<boolean | null> {
  const root = materialization.roots.edgeAlive;
  if (root.status === 'unavailable') {
    return null;
  }
  if (root.status === 'empty') {
    return false;
  }
  return await readRetainedEdgePresence(reader, root, edge);
}

async function readRetainedEdgePresence(
  reader: MaterializationReadPort,
  root: MaterializationHandle['roots']['edgeAlive'],
  edge: MaterializationEdgeTarget,
): Promise<boolean | null> {
  if (root.handle === null) {
    throw liveReadError('retained edge-liveness root has no handle');
  }
  if (reader.hasEdge === undefined) {
    return null;
  }
  return await reader.hasEdge(root.handle, edge);
}

async function readPropertiesRoot(
  reader: MaterializationReadPort,
  materialization: MaterializationHandle,
  nodeId: string,
): Promise<Readonly<Record<string, PropValue>> | undefined> {
  const propertiesRoot = materialization.roots.properties;
  if (propertiesRoot.status === 'unavailable') {
    return undefined;
  }
  if (propertiesRoot.status === 'empty') {
    return Object.freeze({});
  }
  return await readRetainedPropertiesRoot(reader, propertiesRoot, nodeId);
}

async function readRetainedPropertiesRoot(
  reader: MaterializationReadPort,
  propertiesRoot: MaterializationHandle['roots']['properties'],
  nodeId: string,
): Promise<Readonly<Record<string, PropValue>> | undefined> {
  if (propertiesRoot.handle === null) {
    throw liveReadError('retained properties root has no handle');
  }
  const properties = await reader.getNodeProperties(
    propertiesRoot.handle,
    nodeId,
  );
  return properties === undefined
    ? undefined
    : properties ?? Object.freeze({});
}

function propertyReadUnavailable(
  presence: false | null,
): null | undefined {
  return presence === false ? null : undefined;
}

function liveReadError(message: string): WarpError {
  return new WarpError(message, 'E_MATERIALIZATION_RESUME');
}
