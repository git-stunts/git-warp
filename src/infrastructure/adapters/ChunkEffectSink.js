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

import EffectSinkPort from '../../ports/EffectSinkPort.ts';
import { createDeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import {
  OUTCOME_DELIVERED,
  OUTCOME_FAILED,
} from '../../domain/types/ExternalizationPolicy.ts';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * @typedef {import('../../domain/types/EffectEmission.ts').EffectEmission} EffectEmission
 * @typedef {import('../../domain/types/ExternalizationPolicy.ts').ExternalizationPolicy} ExternalizationPolicy
 */

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

/** Default sink ID for ChunkEffectSink. */
const CHUNK_SINK_ID = 'chunk';

/** Filename prefix for chunk NDJSON files. */
const CHUNK_FILE_PREFIX = 'effects-';

/** File extension for chunk NDJSON files. */
const CHUNK_FILE_EXT = '.ndjson';

/** Zero-pad width for chunk index in filenames. */
const CHUNK_INDEX_PAD_WIDTH = 4;

/**
 * Resolves an optional sink ID, falling back to the default chunk sink ID.
 *
 * @param {{ id?: string }} [options]
 * @returns {string}
 */
function resolveSinkId(options) {
  if (options !== null && options !== undefined && options.id !== undefined && options.id !== '') {
    return options.id;
  }
  return CHUNK_SINK_ID;
}

/**
 * Resolves an optional max-bytes value, falling back to the default.
 *
 * @param {{ maxBytes?: number }} [options]
 * @returns {number}
 */
function resolveMaxBytes(options) {
  if (options !== null && options !== undefined && options.maxBytes !== undefined && options.maxBytes !== 0) {
    return options.maxBytes;
  }
  return DEFAULT_MAX_BYTES;
}

export class ChunkEffectSink extends EffectSinkPort {
  /**
   * Constructs a chunk sink that writes NDJSON files to the given directory, rotating when the byte budget is exceeded.
   *
   * @param {{
   *   dir: string,
   *   id?: string,
   *   maxBytes?: number
   * }} options
   */
  constructor(options) {
    super();
    this._id = resolveSinkId(options);
    this._dir = options.dir;
    this._maxBytes = resolveMaxBytes(options);
    /** @type {string | null} */
    this._currentFile = null;
    this._currentBytes = 0;
    this._chunkIndex = 0;
  }

  /**
   * Returns the unique identifier for this chunk sink.
   *
   * @returns {string}
   */
  get id() {
    return this._id;
  }

  /**
   * Writes the emission as NDJSON to the current chunk file, rotating if needed. Returns a 'delivered' or 'failed' observation.
   *
   * @param {EffectEmission} emission
   * @param {ExternalizationPolicy} lens
   * @returns {Promise<import('../../domain/types/DeliveryObservation.ts').DeliveryObservation>}
   */
  async deliver(emission, lens) {
    try {
      await this._write(emission);
      return createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_DELIVERED,
        timestamp: Date.now(),
        lens,
      });
    } catch (/** @type {unknown} */ err) {
      return createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_FAILED,
        reason: err instanceof Error ? err.message : String(err),
        timestamp: Date.now(),
        lens,
      });
    }
  }

  /**
   * Serializes the emission to NDJSON and appends it to the current chunk file, rotating to a new file if the byte budget would be exceeded.
   *
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
      `${CHUNK_FILE_PREFIX}${ts}-${String(this._chunkIndex).padStart(CHUNK_INDEX_PAD_WIDTH, '0')}${CHUNK_FILE_EXT}`,
    );
    this._currentBytes = 0;
  }
}
