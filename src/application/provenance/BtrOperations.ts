import type CryptoPort from '../../ports/CryptoPort.ts';
import type CodecPort from '../../ports/CodecPort.ts';
import type BoundaryTransitionRecordCodecPort from '../../ports/BoundaryTransitionRecordCodecPort.ts';
import type WarpState from '../../domain/services/state/WarpState.ts';
import { hexEncode, hexDecode } from '../../domain/utils/bytes.ts';
import CryptoError from '../../domain/errors/CryptoError.ts';
import WarpError from '../../domain/errors/WarpError.ts';
import BoundaryTransitionRecord, {
  BTR_VERSION,
  VerificationResult,
  validateBTRStructure,
} from '../../domain/services/provenance/BTR.ts';
import BtrSigningEnvelope from '../../domain/services/provenance/BtrSigningEnvelope.ts';
import { ProvenancePayload } from '../../domain/services/provenance/ProvenancePayload.ts';
import {
  serializeFullState,
  deserializeFullState,
  computeStateHash,
} from '../../domain/services/state/StateSerializer.ts';

const HMAC_ALGORITHM = 'sha256';

type BtrCryptoDependencies = {
  readonly crypto: CryptoPort;
  readonly btrCodec: BoundaryTransitionRecordCodecPort;
};

type StateCodecOptions = {
  readonly codec?: CodecPort;
};

type CreateBTROptions = {
  readonly key: string | Uint8Array;
  readonly timestamp: string;
  readonly crypto: CryptoPort;
  readonly btrCodec: BoundaryTransitionRecordCodecPort;
  readonly stateCodec?: CodecPort;
};

type VerifyBTROptions = {
  readonly verifyReplay?: boolean;
  readonly crypto?: CryptoPort;
  readonly btrCodec?: BoundaryTransitionRecordCodecPort;
  readonly stateCodec?: CodecPort;
};

type ReplayBTROptions = {
  readonly crypto?: CryptoPort;
  readonly stateCodec?: CodecPort;
};

type ReplayBTRResult = {
  readonly state: WarpState;
  readonly h_out: string;
};

type BTRVerificationResult = VerificationResult;

function stateCodecOptions(stateCodec: CodecPort | undefined): StateCodecOptions {
  return stateCodec === undefined ? {} : { codec: stateCodec };
}

function replayOptions(crypto: CryptoPort, stateCodec: CodecPort | undefined): ReplayBTROptions {
  return stateCodec === undefined
    ? { crypto }
    : { crypto, stateCodec };
}

function validateHmacKey(key: string | Uint8Array): void {
  if (typeof key === 'string' && key.length === 0) {
    throw new CryptoError('Invalid HMAC key: key must not be empty', { code: 'E_INVALID_HMAC_KEY' });
  }
  if (key instanceof Uint8Array && key.byteLength === 0) {
    throw new CryptoError('Invalid HMAC key: key must not be empty', { code: 'E_INVALID_HMAC_KEY' });
  }
}

async function computeAuthenticationTag(
  envelope: BtrSigningEnvelope,
  key: string | Uint8Array,
  deps: BtrCryptoDependencies,
): Promise<string> {
  const signingBytes = deps.btrCodec.signingBytes(envelope);
  const rawHmac = await deps.crypto.hmac(HMAC_ALGORITHM, key, signingBytes.copyBytes());
  return hexEncode(rawHmac);
}

async function createBTR(
  initialState: WarpState,
  payload: ProvenancePayload,
  opts: CreateBTROptions,
): Promise<BoundaryTransitionRecord> {
  if (!(payload instanceof ProvenancePayload)) {
    throw new WarpError('payload must be a ProvenancePayload', 'E_BTR_INVALID_PAYLOAD');
  }

  validateHmacKey(opts.key);

  const h_in = await computeStateHash(initialState, { crypto: opts.crypto, ...stateCodecOptions(opts.stateCodec) });
  const U_0 = serializeFullState(initialState, stateCodecOptions(opts.stateCodec));
  const finalState = payload.replay(initialState);
  const h_out = await computeStateHash(finalState, { crypto: opts.crypto, ...stateCodecOptions(opts.stateCodec) });

  const envelope = new BtrSigningEnvelope({
    version: BTR_VERSION,
    h_in,
    h_out,
    U_0,
    P: payload.provenance,
    t: opts.timestamp,
  });
  const kappa = await computeAuthenticationTag(envelope, opts.key, {
    crypto: opts.crypto,
    btrCodec: opts.btrCodec,
  });

  return new BoundaryTransitionRecord({
    version: envelope.version,
    h_in: envelope.h_in,
    h_out: envelope.h_out,
    U_0: envelope.U_0,
    P: envelope.provenance,
    t: envelope.t,
    kappa,
  });
}

async function verifyBTR(
  btr: BoundaryTransitionRecord,
  key: string | Uint8Array,
  opts: VerifyBTROptions = {},
): Promise<VerificationResult> {
  const structError = validateBTRStructure(btr);
  if (structError !== null) {
    return new VerificationResult(false, structError);
  }

  if (opts.crypto === undefined) {
    return new VerificationResult(false, 'CryptoPort required for HMAC verification');
  }
  if (opts.btrCodec === undefined) {
    return new VerificationResult(false, 'BoundaryTransitionRecordCodecPort required for HMAC verification');
  }

  let hmacValid: boolean;
  try {
    const expected = await computeAuthenticationTag(
      btr.envelope,
      key,
      { crypto: opts.crypto, btrCodec: opts.btrCodec },
    );
    const actualBuf = hexDecode(btr.kappa);
    const expectedBuf = hexDecode(expected);
    hmacValid = actualBuf.length === expectedBuf.length
      && opts.crypto.timingSafeEqual(actualBuf, expectedBuf);
  } catch (err) {
    if (err instanceof RangeError) {
      return new VerificationResult(false, `Invalid hex in authentication tag: ${err.message}`);
    }
    throw err;
  }

  if (!hmacValid) {
    return new VerificationResult(false, 'Authentication tag mismatch');
  }

  if (opts.verifyReplay === true) {
    try {
      const result = await replayBTR(btr, replayOptions(opts.crypto, opts.stateCodec));
      if (result.h_out !== btr.h_out) {
        return new VerificationResult(false, `Replay produced different h_out: expected ${btr.h_out}, got ${result.h_out}`);
      }
    } catch (err) {
      return new VerificationResult(false, `Replay failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return new VerificationResult(true);
}

async function replayBTR(
  btr: BoundaryTransitionRecord,
  deps: ReplayBTROptions = {},
): Promise<ReplayBTRResult> {
  const initialState = deserializeFullState(btr.U_0, stateCodecOptions(deps.stateCodec));
  const payload = ProvenancePayload.fromEntries(btr.P);
  const finalState = payload.replay(initialState);

  if (!deps.crypto) {
    throw new CryptoError('CryptoPort required for state hash', { code: 'E_MISSING_CRYPTO' });
  }
  const h_out = await computeStateHash(finalState, { crypto: deps.crypto, ...stateCodecOptions(deps.stateCodec) });
  return { state: finalState, h_out };
}

export { createBTR, verifyBTR, replayBTR };
export type {
  CreateBTROptions,
  VerifyBTROptions,
  ReplayBTROptions,
  ReplayBTRResult,
  BTRVerificationResult,
};
