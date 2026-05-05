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
import { createDeliveryObservation, type DeliveryObservation } from '../../domain/types/DeliveryObservation.ts';
import type { EffectEmission } from '../../domain/types/EffectEmission.ts';
import {
  OUTCOME_DELIVERED,
  OUTCOME_FAILED,
  type ExternalizationPolicy,
} from '../../domain/types/ExternalizationPolicy.ts';
import { appendFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10 MiB

/** Default sink ID for ChunkEffectSink. */
const CHUNK_SINK_ID = 'chunk';

/** Filename prefix for chunk NDJSON files. */
const CHUNK_FILE_PREFIX = 'effects-';

/** File extension for chunk NDJSON files. */
const CHUNK_FILE_EXT = '.ndjson';

/** Zero-pad width for chunk index in filenames. */
const CHUNK_INDEX_PAD_WIDTH = 4;

function resolveSinkId(options?: { id?: string }): string {
  if (options !== null && options !== undefined && options.id !== undefined && options.id !== '') {
    return options.id;
  }
  return CHUNK_SINK_ID;
}

function resolveMaxBytes(options?: { maxBytes?: number }): number {
  if (options !== null && options !== undefined && options.maxBytes !== undefined && options.maxBytes !== 0) {
    return options.maxBytes;
  }
  return DEFAULT_MAX_BYTES;
}

export class ChunkEffectSink extends EffectSinkPort {
  private readonly _id: string;
  private readonly _dir: string;
  private readonly _maxBytes: number;
  private _currentFile: string | null;
  private _currentBytes: number;
  private _chunkIndex: number;

  constructor(options: { dir: string; id?: string; maxBytes?: number }) {
    super();
    this._id = resolveSinkId(options);
    this._dir = options.dir;
    this._maxBytes = resolveMaxBytes(options);
    this._currentFile = null;
    this._currentBytes = 0;
    this._chunkIndex = 0;
  }

  get id(): string {
    return this._id;
  }

  async deliver(emission: EffectEmission, lens: ExternalizationPolicy): Promise<DeliveryObservation> {
    try {
      await this._write(emission);
      return createDeliveryObservation({
        emissionId: emission.id,
        sinkId: this._id,
        outcome: OUTCOME_DELIVERED,
        timestamp: Date.now(),
        lens,
      });
    } catch (err: unknown) {
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

  private async _write(emission: EffectEmission): Promise<void> {
    if (this._currentFile === null) {
      this._rotate();
    }

    const line = `${JSON.stringify(emission)}\n`;
    const lineBytes = Buffer.byteLength(line, 'utf8');

    // Rotate if adding this line would exceed the budget
    if (this._currentBytes + lineBytes > this._maxBytes && this._currentBytes > 0) {
      this._rotate();
    }

    const filePath = this._currentFile as string;

    if (this._currentBytes === 0) {
      await writeFile(filePath, line, 'utf8');
    } else {
      await appendFile(filePath, line, 'utf8');
    }

    this._currentBytes += lineBytes;
  }

  private _rotate(): void {
    this._chunkIndex += 1;
    const ts = Date.now();
    this._currentFile = join(
      this._dir,
      `${CHUNK_FILE_PREFIX}${ts}-${String(this._chunkIndex).padStart(CHUNK_INDEX_PAD_WIDTH, '0')}${CHUNK_FILE_EXT}`,
    );
    this._currentBytes = 0;
  }
}
