/**
 * Unmaterialized intent capability for declarative machine work admission.
 */

import type { IntentAdmissionReceipt } from '../admission/IntentAdmissionReceipt.ts';
import type { WarpIntentDescriptor } from '../types/WarpIntentDescriptor.ts';

export default abstract class IntentCapability {
  /** Admit an unmaterialized intent descriptor directly to the worldline. */
  abstract admitIntent(_descriptor: WarpIntentDescriptor): Promise<IntentAdmissionReceipt>;

  /** Queue an intent for a speculative strand. */
  abstract queueIntent(
    _strandId: string,
    _descriptor: WarpIntentDescriptor,
  ): Promise<IntentAdmissionReceipt>;

  /** List unmaterialized intents queued for a writer. */
  abstract getWriterIntents(_writerId: string): Promise<WarpIntentDescriptor[]>;
}
