import type MaterializationCoordinate from '../../domain/materialization/MaterializationCoordinate.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';
import {
  MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  materializationCoordinateData,
} from './GitCasMaterializationDescriptor.ts';
import { requireNonEmpty } from './GitCasMaterializationStoreValidation.ts';

/** Lane-scoped identity for current materialization cache entries. */
export default class GitCasMaterializationCacheKey {
  readonly #codec: CodecPort;
  readonly #crypto: CryptoPort;
  readonly #laneName: string;

  constructor(options: {
    readonly codec: CodecPort;
    readonly crypto: CryptoPort;
    readonly laneName: string;
  }) {
    this.#codec = options.codec;
    this.#crypto = options.crypto;
    this.#laneName = options.laneName;
  }

  async forCoordinate(
    coordinate: MaterializationCoordinate,
    schemaVersion = MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
  ): Promise<string> {
    const digest = await this.#digest({
      schemaVersion,
      laneName: this.#laneName,
      coordinate: materializationCoordinateData(coordinate),
    }, 'coordinate digest');
    if (schemaVersion === MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION) {
      return `${await this.currentPrefix()}${digest}`;
    }
    return `v${String(schemaVersion)}:${digest}`;
  }

  async currentPrefix(): Promise<string> {
    const digest = await this.#digest({
      schemaVersion: MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION,
      laneName: this.#laneName,
    }, 'lane digest');
    return `v${String(MATERIALIZATION_DESCRIPTOR_SCHEMA_VERSION)}:${digest}:`;
  }

  async #digest(value: object, field: string): Promise<string> {
    return requireNonEmpty(
      await this.#crypto.hash('sha256', this.#codec.encode(value)),
      field,
    );
  }
}
