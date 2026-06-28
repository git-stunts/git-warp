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
    const randomSuffix = Math.floor(Math.random() * 1000000);
    let sha = `blob:intent:${descriptor.intentId}:${randomSuffix}`;
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
      const actualStatus = nodeProps?.status ?? 'ABSENT';
      if (actualStatus !== guard.expected) {
        return { tag: guard.failureTag, nodeId: guard.nodeId, actual: String(actualStatus) };
      }
    } else if (guard.op === 'nodeUnassignedOrSelf') {
      const assignedAgent = nodeProps?.agentId ?? null;
      if (assignedAgent !== null && assignedAgent !== guard.agentId) {
        return { tag: guard.failureTag, nodeId: guard.nodeId, actual: String(assignedAgent) };
      }
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
