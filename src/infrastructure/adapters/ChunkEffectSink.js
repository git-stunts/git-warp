/**
 * ChunkEffectSink — rotating append-only NDJSON file sink.
 *
 * Writes effect emissions as newline-delimited JSON to files in a
 * directory. Rotates to a new file when the byte budget is exceeded.
 *
 * This sink is replay-safe: it writes to the local forensic log
 * regardless of delivery lens. Local diagnostic output is never
 * suppressed — only external adapters respect suppressExternal.
 *
 * @module ChunkEffectSink
 */

import EffectSinkPort from '../../ports/EffectSinkPort.js';
import { createDeliveryObservation } from '../../domain/types/DeliveryObservation.js';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @typedef {import('../../domain/types/EffectEmission.js').EffectEmission} EffectEmission
 * @typedef {import('../../domain/types/ExternalizationPolicy.js').ExternalizationPolicy} ExternalizationPolicy
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

export class ChunkEffectSink extends EffectSinkPort {
  /**
   * @param {{
   *   dir: string,
   *   id?: string,
   *   maxBytes?: number
   * }} options
   */
  constructor(options) {
    super();
    this._id = (options && options.id) || 'chunk';
    this._dir = options.dir;
    this._maxBytes = (options && options.maxBytes) || DEFAULT_MAX_BYTES;
    /** @type {string | null} */
    this._currentFile = null;
    this._currentBytes = 0;
    this._chunkIndex = 0;
  }

  /** @returns {string} */
  get id() {
    return this._id;
  }

  /**
   * @param {EffectEmission} emission
   * @param {ExternalizationPolicy} lens
   * @returns {Promise<import('../../domain/types/DeliveryObservation.js').DeliveryObservation>}
   */
  async deliver(emission, lens) {
    try {
      await this._write(emission);
      return createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: 'delivered',
        timestamp: Date.now(),
        lens,
      });
    } catch (/** @type {unknown} */ err) {
      return createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: 'failed',
        reason: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
        lens,
      });
    }
  }

  /**
   * @param {EffectEmission} emission
   * @returns {Promise<void>}
   */
  async _write(emission) {
    if (this._currentFile === null) {
      this._rotate();
    }

    const line = `${JSON.stringify(emission)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');

    // Rotate if adding this line would exceed the budget
    if (this._currentBytes + lineBytes > this._maxBytes && this._currentBytes > 0) {
      this._rotate();
    }

    const filePath = /** @type {string} */ (this._currentFile);

    if (this._currentBytes === 0) {
      await writeFile(filePath, line, 'utf8');
    } else {
      await appendFile(filePath, line, 'utf8');
    }

    this._currentBytes += lineBytes;
  }

  /**
   * Advances to a new chunk file.
   *
   * @returns {void}
   */
  _rotate() {
    this._chunkIndex += 1;
    const ts = Date.now();
    this._currentFile = join(
      this._dir,
      `effects-${ts}-${String(this._chunkIndex).padStart(4, '0')}.ndjson`,
    );
    this._currentBytes = 0;
  }
}
