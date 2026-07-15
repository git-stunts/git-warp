import EncryptionError from '../../domain/errors/EncryptionError.ts';

export type CasContentEncryptionScheme = 'whole' | 'framed' | 'convergent';

export interface CasVaultResolutionWitness {
  readonly vaultSlug: string;
  readonly keyId: string;
  readonly verification: 'verified' | 'failed-passphrase' | 'missing-metadata';
  readonly rotationEpoch: number;
  readonly encryptionCount: number;
  readonly encryptionCountLimit: number;
  readonly privacyMode: boolean;
}

export interface CasResolvedVaultKeyOptions {
  readonly encryptionKey: Uint8Array;
  readonly scheme: string;
  readonly vault: CasVaultResolutionWitness;
  readonly frameBytes?: number;
}

export interface CasContentEncryptionDiagnostics {
  readonly vaultSlug: string;
  readonly keyId: string;
  readonly rotationEpoch: number;
  readonly encryptionCount: number;
  readonly encryptionCountLimit: number;
  readonly privacyMode: boolean;
}

export interface CasStoreEncryptionOptions {
  readonly scheme: CasContentEncryptionScheme;
  readonly frameBytes?: number;
  readonly convergent?: boolean;
}

export interface CasStoreEncryptionArguments {
  readonly encryptionKey?: Uint8Array;
  readonly encryption?: CasStoreEncryptionOptions;
}

export interface CasRestoreEncryptionArguments {
  readonly encryptionKey?: Uint8Array;
}

interface CasContentEncryptionPolicyFields {
  readonly enabled: boolean;
  readonly encryptionKey?: Uint8Array;
  readonly scheme?: CasContentEncryptionScheme;
  readonly frameBytes?: number;
  readonly diagnostics?: CasContentEncryptionDiagnostics;
}

interface InternalResolvedKeyOptions {
  readonly encryptionKey: Uint8Array;
  readonly scheme?: string;
  readonly frameBytes?: number;
}

interface EnabledFieldInput {
  readonly encryptionKey: Uint8Array;
  readonly scheme: CasContentEncryptionScheme;
  readonly frameBytes: number | undefined;
  readonly diagnostics: CasContentEncryptionDiagnostics | undefined;
}

type CasContentEncryptionErrorKind =
  | 'legacy-scheme'
  | 'wrong-passphrase'
  | 'missing-vault-metadata'
  | 'decryption-integrity'
  | 'none';

const CONTENT_ENCRYPTION_ERRORS: Readonly<Record<
  Exclude<CasContentEncryptionErrorKind, 'none'>,
  Readonly<{ message: string; code: string }>
>> = Object.freeze({
  'legacy-scheme': Object.freeze({
    message: 'Legacy git-cas encryption schemes require migration before git-warp can restore this CAS content',
    code: 'E_CAS_LEGACY_ENCRYPTION_SCHEME',
  }),
  'wrong-passphrase': Object.freeze({
    message: 'git-cas vault passphrase verification failed while resolving CAS content encryption',
    code: 'E_CAS_VAULT_PASSPHRASE_FAILED',
  }),
  'missing-vault-metadata': Object.freeze({
    message: 'git-cas vault metadata is missing or invalid for encrypted CAS content',
    code: 'E_CAS_VAULT_METADATA_MISSING',
  }),
  'decryption-integrity': Object.freeze({
    message: 'git-cas could not authenticate or decrypt encrypted CAS content',
    code: 'E_CAS_CONTENT_DECRYPTION_FAILED',
  }),
});

const LEGACY_SCHEME_VALUES = new Set([
  'whole-v1',
  'whole-v2',
  'framed-v1',
  'framed-v2',
  'convergent-v1',
]);

const REQUIRED_KEY_BYTES = 32;

export default class CasContentEncryptionPolicy {
  private readonly _enabled: boolean;
  private readonly _encryptionKey: Uint8Array | undefined;
  private readonly _scheme: CasContentEncryptionScheme | undefined;
  private readonly _frameBytes: number | undefined;
  private readonly _diagnostics: CasContentEncryptionDiagnostics | undefined;

  private constructor(fields: CasContentEncryptionPolicyFields) {
    this._enabled = fields.enabled;
    this._encryptionKey = fields.encryptionKey;
    this._scheme = fields.scheme;
    this._frameBytes = fields.frameBytes;
    this._diagnostics = fields.diagnostics;
    Object.freeze(this);
  }

  static disabled(): CasContentEncryptionPolicy {
    return new CasContentEncryptionPolicy({ enabled: false });
  }

  static fromResolvedVaultKey(options: CasResolvedVaultKeyOptions): CasContentEncryptionPolicy {
    const scheme = normalizeScheme(options.scheme);
    const frameBytes = normalizeFrameBytes(scheme, options.frameBytes);
    const diagnostics = validateVaultWitness(options.vault);
    return new CasContentEncryptionPolicy(
      enabledFields({
        encryptionKey: copyValidatedKey(options.encryptionKey, diagnostics),
        scheme,
        frameBytes,
        diagnostics,
      }),
    );
  }

  /** @internal Raw keys may only enter here after a caller-owned boundary resolved them. */
  static fromInternalResolvedKey(options: InternalResolvedKeyOptions): CasContentEncryptionPolicy {
    const scheme = normalizeScheme(options.scheme ?? 'whole');
    const frameBytes = normalizeFrameBytes(scheme, options.frameBytes);
    return new CasContentEncryptionPolicy(
      enabledFields({
        encryptionKey: copyValidatedKey(options.encryptionKey, null),
        scheme,
        frameBytes,
        diagnostics: undefined,
      }),
    );
  }

  get enabled(): boolean {
    return this._enabled;
  }

  get scheme(): CasContentEncryptionScheme | null {
    return this._scheme ?? null;
  }

  vaultDiagnostics(): CasContentEncryptionDiagnostics | null {
    return this._diagnostics ?? null;
  }

  toStoreOptions(): CasStoreEncryptionArguments {
    if (!this._enabled) {
      return {};
    }
    return {
      encryptionKey: this._copyKey(),
      encryption: this._storeEncryptionOptions(),
    };
  }

  toRestoreOptions(): CasRestoreEncryptionArguments {
    if (!this._enabled) {
      return {};
    }
    return { encryptionKey: this._copyKey() };
  }

  private _copyKey(): Uint8Array {
    if (this._encryptionKey === undefined) {
      throw encryptionPolicyError('CAS content encryption is enabled without a resolved key', 'E_CAS_ENCRYPTION_KEY_MISSING');
    }
    return new Uint8Array(this._encryptionKey);
  }

  private _storeEncryptionOptions(): CasStoreEncryptionOptions {
    const scheme = this._requireScheme();
    if (scheme === 'convergent') {
      return { scheme, convergent: true };
    }
    if (scheme === 'framed' && this._frameBytes !== undefined) {
      return { scheme, frameBytes: this._frameBytes };
    }
    return { scheme };
  }

  private _requireScheme(): CasContentEncryptionScheme {
    if (this._scheme === undefined) {
      throw encryptionPolicyError('CAS content encryption is enabled without a current scheme', 'E_CAS_ENCRYPTION_SCHEME_MISSING');
    }
    return this._scheme;
  }
}

export function mapCasContentEncryptionError(
  error: unknown,
  surface: string,
  encryptedContent = false,
): EncryptionError | null {
  if (error instanceof EncryptionError) {
    return error;
  }
  const code = errorCode(error);
  const message = errorMessage(error);
  const kind = classifyCasContentEncryptionError(code, message, encryptedContent);
  if (kind === 'none') {
    return null;
  }
  const mapped = CONTENT_ENCRYPTION_ERRORS[kind];
  return encryptionPolicyError(mapped.message, mapped.code, {
    surface,
    upstreamCode: code,
    upstreamMessage: message,
  });
}

function enabledFields(input: EnabledFieldInput): CasContentEncryptionPolicyFields {
  const base = input.diagnostics === undefined
    ? { enabled: true, encryptionKey: input.encryptionKey, scheme: input.scheme }
    : { enabled: true, encryptionKey: input.encryptionKey, scheme: input.scheme, diagnostics: input.diagnostics };
  if (input.frameBytes === undefined) {
    return base;
  }
  return { ...base, frameBytes: input.frameBytes };
}

function normalizeScheme(scheme: string): CasContentEncryptionScheme {
  if (scheme === 'whole' || scheme === 'framed' || scheme === 'convergent') {
    return scheme;
  }
  if (LEGACY_SCHEME_VALUES.has(scheme)) {
    throw encryptionPolicyError(
      `Legacy git-cas encryption scheme "${scheme}" is not accepted by git-warp current writes`,
      'E_CAS_LEGACY_ENCRYPTION_SCHEME',
      { scheme, migration: 'Run the git-cas legacy encryption migration before writing through git-warp.' },
    );
  }
  throw encryptionPolicyError(
    `Unsupported git-cas encryption scheme "${scheme}"`,
    'E_CAS_ENCRYPTION_SCHEME_UNSUPPORTED',
    { scheme },
  );
}

function normalizeFrameBytes(
  scheme: CasContentEncryptionScheme,
  frameBytes: number | undefined,
): number | undefined {
  if (frameBytes === undefined) {
    return undefined;
  }
  if (scheme !== 'framed') {
    throw encryptionPolicyError(
      `encryption.frameBytes is only valid for framed CAS content encryption, not ${scheme}`,
      'E_CAS_ENCRYPTION_FRAME_BYTES_UNSUPPORTED',
      { scheme, frameBytes },
    );
  }
  if (!Number.isSafeInteger(frameBytes) || frameBytes < 1) {
    throw encryptionPolicyError(
      'encryption.frameBytes must be a positive safe integer',
      'E_CAS_ENCRYPTION_FRAME_BYTES_INVALID',
      { scheme, frameBytes },
    );
  }
  return frameBytes;
}

function validateVaultWitness(witness: CasVaultResolutionWitness): CasContentEncryptionDiagnostics {
  assertVaultVerification(witness);
  assertNonEmpty(witness.vaultSlug, 'vaultSlug', 'E_CAS_VAULT_SLUG_INVALID');
  assertNonEmpty(witness.keyId, 'keyId', 'E_CAS_VAULT_KEY_ID_INVALID');
  assertVaultRotationCounters(witness);
  assertVaultRotationOpen(witness);
  return vaultDiagnosticsFrom(witness);
}

function assertVaultVerification(witness: CasVaultResolutionWitness): void {
  if (witness.verification === 'failed-passphrase') {
    throw encryptionPolicyError(
      'git-cas vault passphrase verification failed while resolving CAS content encryption',
      'E_CAS_VAULT_PASSPHRASE_FAILED',
      { vaultSlug: witness.vaultSlug, keyId: witness.keyId },
    );
  }
  if (witness.verification === 'missing-metadata') {
    throw encryptionPolicyError(
      'git-cas vault metadata is required before enabling CAS content encryption',
      'E_CAS_VAULT_METADATA_MISSING',
      { vaultSlug: witness.vaultSlug, keyId: witness.keyId },
    );
  }
}

function assertVaultRotationCounters(witness: CasVaultResolutionWitness): void {
  assertNonNegativeInteger(witness.rotationEpoch, 'rotationEpoch', 'E_CAS_VAULT_ROTATION_INVALID');
  assertNonNegativeInteger(witness.encryptionCount, 'encryptionCount', 'E_CAS_VAULT_ROTATION_INVALID');
  assertPositiveInteger(witness.encryptionCountLimit, 'encryptionCountLimit', 'E_CAS_VAULT_ROTATION_INVALID');
}

function assertVaultRotationOpen(witness: CasVaultResolutionWitness): void {
  if (witness.encryptionCount >= witness.encryptionCountLimit) {
    throw encryptionPolicyError(
      'git-cas vault encryption count reached its rotation limit; rotate before writing more encrypted CAS content',
      'E_CAS_VAULT_ROTATION_REQUIRED',
      {
        vaultSlug: witness.vaultSlug,
        keyId: witness.keyId,
        encryptionCount: witness.encryptionCount,
        encryptionCountLimit: witness.encryptionCountLimit,
      },
    );
  }
}

function vaultDiagnosticsFrom(witness: CasVaultResolutionWitness): CasContentEncryptionDiagnostics {
  return Object.freeze({
    vaultSlug: witness.vaultSlug,
    keyId: witness.keyId,
    rotationEpoch: witness.rotationEpoch,
    encryptionCount: witness.encryptionCount,
    encryptionCountLimit: witness.encryptionCountLimit,
    privacyMode: witness.privacyMode,
  });
}

function validateKey(
  encryptionKey: Uint8Array,
  diagnostics: CasContentEncryptionDiagnostics | null,
): Uint8Array {
  if (!(encryptionKey instanceof Uint8Array) || encryptionKey.byteLength !== REQUIRED_KEY_BYTES) {
    throw encryptionPolicyError(
      `CAS content encryption requires a ${REQUIRED_KEY_BYTES}-byte resolved key`,
      'E_CAS_ENCRYPTION_KEY_INVALID',
      diagnostics === null ? {} : { vaultSlug: diagnostics.vaultSlug, keyId: diagnostics.keyId },
    );
  }
  return encryptionKey;
}

function copyValidatedKey(
  encryptionKey: Uint8Array,
  diagnostics: CasContentEncryptionDiagnostics | null,
): Uint8Array {
  return new Uint8Array(validateKey(encryptionKey, diagnostics));
}

function assertNonEmpty(value: string, field: string, code: string): void {
  if (value.length === 0) {
    throw encryptionPolicyError(`git-cas vault ${field} must not be empty`, code, { field });
  }
}

function assertNonNegativeInteger(value: number, field: string, code: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw encryptionPolicyError(`git-cas vault ${field} must be a non-negative safe integer`, code, { field, value });
  }
}

function assertPositiveInteger(value: number, field: string, code: string): void {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw encryptionPolicyError(`git-cas vault ${field} must be a positive safe integer`, code, { field, value });
  }
}

function errorCode(error: unknown): string | null {
  return hasStringCode(error) ? error.code : null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isLegacySchemeMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('legacy encryption scheme') || normalized.includes('legacy_scheme');
}

function isWrongPassphraseMessage(message: string): boolean {
  return message.toLowerCase().includes('vault passphrase verification failed');
}

function isMissingVaultMetadataMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes('.vault.json')
    || normalized.includes('vault metadata')
    || normalized.includes('privacy index metadata is missing');
}

function classifyCasContentEncryptionError(
  code: string | null,
  message: string,
  encryptedContent: boolean,
): CasContentEncryptionErrorKind {
  if (isLegacyCasEncryptionError(code, message)) {
    return 'legacy-scheme';
  }
  if (isWrongPassphraseMessage(message)) {
    return 'wrong-passphrase';
  }
  if (isMissingVaultMetadataError(code, message)) {
    return 'missing-vault-metadata';
  }
  return encryptedContent ? classifyEncryptedContentIntegrity(code) : 'none';
}

function classifyEncryptedContentIntegrity(code: string | null): CasContentEncryptionErrorKind {
  const isIntegrityFailure = code === 'INTEGRITY_ERROR'
    || code === 'MANIFEST_INTEGRITY_ERROR'
    || code === 'DECRYPTION_BUFFER_EXCEEDED';
  return isIntegrityFailure ? 'decryption-integrity' : 'none';
}

function isLegacyCasEncryptionError(code: string | null, message: string): boolean {
  if (code === 'LEGACY_SCHEME') {
    return true;
  }
  return isLegacySchemeMessage(message);
}

function isMissingVaultMetadataError(code: string | null, message: string): boolean {
  if (code === 'VAULT_METADATA_INVALID') {
    return true;
  }
  return isMissingVaultMetadataMessage(message);
}

function hasStringCode(error: unknown): error is { readonly code: string } {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof error.code === 'string';
}

function encryptionPolicyError(
  message: string,
  code: string,
  context: Record<string, unknown> = {},
): EncryptionError {
  return new EncryptionError(message, { code, context });
}
