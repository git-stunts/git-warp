/**
 * IntentController — encapsulates unmaterialized intent admission operations.
 *
 * @module domain/services/controllers/IntentController
 */

import type IntentCapability from '../../capabilities/IntentCapability.ts';
import type { WarpIntentDescriptor, WarpIntentOutcome } from '../../types/WarpIntentDescriptor.ts';
import type ProjectionHandle from '../ProjectionHandle.ts';

export type IntentHost = {
  _graphName: string;
  _writerId: string;
  _persistence: {
    writeBlob?: (blob: Uint8Array) => Promise<string>;
  };
  worldline: () => ProjectionHandle;
};

export default class IntentController implements IntentCapability {
  _host: IntentHost;
  private _queuedIntents: Map<string, WarpIntentDescriptor[]>;

  constructor(host: IntentHost) {
    this._host = host;
    this._queuedIntents = new Map();
  }

  async admitIntent(descriptor: WarpIntentDescriptor): Promise<WarpIntentOutcome> {
    const worldline = this._host.worldline();
    for (const guard of descriptor.precommitGuards) {
      const nodeProps = await worldline.getNodeProps(guard.nodeId);
      const obstruction = this._checkGuard(guard, nodeProps);
      if (obstruction !== null) {
        return { admitted: false, obstruction, intentId: descriptor.intentId };
      }
    }
    const jsonBytes = new TextEncoder().encode(JSON.stringify(descriptor));
    let sha = `blob:intent:${descriptor.intentId}:${this._host._writerId}`;
    if (typeof this._host._persistence.writeBlob === 'function') {
      sha = await this._host._persistence.writeBlob(jsonBytes);
    }
    return { admitted: true, sha, intentId: descriptor.intentId };
  }

  private _checkGuard(
    guard: WarpIntentDescriptor['precommitGuards'][number],
    nodeProps: Readonly<{ [key: string]: unknown }> | null,
  ) {
    if (guard.op === 'nodeStatus') {
      return this._checkStatusGuard(guard, nodeProps);
    }
    if (guard.op === 'nodeUnassignedOrSelf') {
      return this._checkAgentGuard(guard, nodeProps);
    }
    return null;
  }

  private _checkStatusGuard(
    guard: { op: 'nodeStatus'; nodeId: string; expected: string; failureTag: string },
    nodeProps: Readonly<{ [key: string]: unknown }> | null,
  ) {
    const raw = nodeProps ? nodeProps['status'] : null;
    const actualStatus = typeof raw === 'string' ? raw : 'ABSENT';
    if (actualStatus !== guard.expected) {
      return { tag: guard.failureTag, nodeId: guard.nodeId, actual: actualStatus };
    }
    return null;
  }

  private _checkAgentGuard(
    guard: { op: 'nodeUnassignedOrSelf'; nodeId: string; agentId: string; failureTag: string },
    nodeProps: Readonly<{ [key: string]: unknown }> | null,
  ) {
    const raw = nodeProps ? nodeProps['agentId'] : null;
    const assignedAgent = typeof raw === 'string' ? raw : null;
    if (assignedAgent !== null && assignedAgent !== guard.agentId) {
      return { tag: guard.failureTag, nodeId: guard.nodeId, actual: assignedAgent };
    }
    return null;
  }

  async queueIntent(strandId: string, descriptor: WarpIntentDescriptor): Promise<WarpIntentOutcome> {
    await Promise.resolve();
    const list = this._queuedIntents.get(strandId) ?? [];
    list.push(descriptor);
    this._queuedIntents.set(strandId, list);
    return {
      admitted: true,
      sha: `queued:${strandId}:${descriptor.intentId}`,
      intentId: descriptor.intentId,
    };
  }

  async getWriterIntents(writerId: string): Promise<WarpIntentDescriptor[]> {
    await Promise.resolve();
    return this._queuedIntents.get(writerId) ?? [];
  }
}
