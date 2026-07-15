/**
 * IntentController — encapsulates unmaterialized intent admission operations.
 *
 * @module domain/services/controllers/IntentController
 */

import type IntentCapability from '../../capabilities/IntentCapability.ts';
import type { WarpIntentDescriptor, WarpIntentOutcome } from '../../types/WarpIntentDescriptor.ts';
import type ProjectionHandle from '../ProjectionHandle.ts';
import type IntentStorePort from '../../../ports/IntentStorePort.ts';

export type IntentHost = {
  _graphName: string;
  _writerId: string;
  _intentStore: IntentStorePort;
  worldline: () => ProjectionHandle;
};

export default class IntentController implements IntentCapability {
  _host: IntentHost;
  constructor(host: IntentHost) {
    this._host = host;
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
    const published = await this._host._intentStore.publish({
      graphName: this._host._graphName,
      channel: 'admitted',
      ownerId: this._host._writerId,
      descriptor,
    });
    return {
      admitted: true,
      sha: published.sha,
      intentId: descriptor.intentId,
      retention: published.retention,
    };
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
    guard: WarpIntentDescriptor['precommitGuards'][number],
    nodeProps: Readonly<{ [key: string]: unknown }> | null,
  ) {
    const raw = nodeProps ? nodeProps['status'] : 'ABSENT';
    const actualStatus = typeof raw === 'string' ? raw : 'ABSENT';
    const { expected } = guard as unknown as { expected: string };
    if (actualStatus !== expected) {
      return { tag: guard.failureTag, nodeId: guard.nodeId, actual: actualStatus };
    }
    return null;
  }

  private _checkAgentGuard(
    guard: WarpIntentDescriptor['precommitGuards'][number],
    nodeProps: Readonly<{ [key: string]: unknown }> | null,
  ) {
    if (!nodeProps) { return null; }
    const raw = nodeProps['agentId'];
    if (typeof raw !== 'string') { return null; }
    const { agentId } = guard as unknown as { agentId: string };
    if (raw !== agentId) {
      return { tag: guard.failureTag, nodeId: guard.nodeId, actual: raw };
    }
    return null;
  }

  async queueIntent(strandId: string, descriptor: WarpIntentDescriptor): Promise<WarpIntentOutcome> {
    const published = await this._host._intentStore.publish({
      graphName: this._host._graphName,
      channel: 'queued',
      ownerId: strandId,
      descriptor,
    });
    return {
      admitted: true,
      sha: published.sha,
      intentId: descriptor.intentId,
      retention: published.retention,
    };
  }

  async getWriterIntents(writerId: string): Promise<WarpIntentDescriptor[]> {
    return await this._host._intentStore
      .scan(this._host._graphName, 'queued', writerId)
      .collect();
  }
}
