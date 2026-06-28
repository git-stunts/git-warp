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
    const query = worldline.query();

    for (const guard of descriptor.precommitGuards) {
      const nodeResult = await query.node(guard.nodeId).read();
      if (guard.op === 'nodeStatus') {
        const actualStatus = nodeResult?.status ?? 'ABSENT';
        if (actualStatus !== guard.expected) {
          return {
            admitted: false,
            obstruction: {
              tag: guard.failureTag,
              nodeId: guard.nodeId,
              actual: String(actualStatus),
            },
            intentId: descriptor.intentId,
          };
        }
      } else if (guard.op === 'nodeUnassignedOrSelf') {
        const assignedAgent = nodeResult?.agentId ?? null;
        if (assignedAgent !== null && assignedAgent !== guard.agentId) {
          return {
            admitted: false,
            obstruction: {
              tag: guard.failureTag,
              nodeId: guard.nodeId,
              actual: String(assignedAgent),
            },
            intentId: descriptor.intentId,
          };
        }
      }
    }

    const jsonBytes = new TextEncoder().encode(JSON.stringify(descriptor));
    let sha = `blob:intent:${descriptor.intentId}:${Date.now()}`;
    if (typeof this._host._persistence.writeBlob === 'function') {
      sha = await this._host._persistence.writeBlob(jsonBytes);
    }

    return {
      admitted: true,
      sha,
      intentId: descriptor.intentId,
    };
  }

  async queueIntent(strandId: string, descriptor: WarpIntentDescriptor): Promise<WarpIntentOutcome> {
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
    return this._queuedIntents.get(writerId) ?? [];
  }
}
