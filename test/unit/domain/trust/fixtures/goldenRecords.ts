/**
 * Golden canonical fixtures for Trust V1 tests.
 *
 * Pre-computed with real Ed25519 signatures and pinned recordId
 * digests. Exported as TrustRecord instances — tests use them
 * directly with zero wrapping.
 *
 * Chain order: keyAdd1 → keyAdd2 → writerBindAdd → keyRevoke → writerBindRevoke
 */

import { TrustRecord } from '../../../../../src/domain/trust/TrustRecord.ts';
import type { DecodedTrustRecord } from '../../../../../src/domain/trust/TrustRecord.ts';
import { signaturePayload } from '../../../../../src/domain/trust/canonical.ts';
import { textEncode } from '../../../../../src/domain/utils/bytes.ts';

// -- Key material -------------------------------------------------------------

const PUBLIC_KEY_1 = 'iNP+GiMyG/n678w8SjU44SxetetK4DoEESjC5X8NGkc=';
const PUBLIC_KEY_2 = 'uqewhqMC1oyVPsMhn8Vmrkt+SNlY2AA2/WogFOsfEME=';
const KEY_ID_1 = 'ed25519:3f07070d046593892c24c2875aa3e03fa877c4cbb66b246d6a867aa3fc66b5b9';
const KEY_ID_2 = 'ed25519:e0c7d43725576d9c0582bb4884b2906cda1bb2f7c156417e53166d7a59b73d92';
const PRIVATE_KEY_1_PKCS8 = 'MC4CAQAwBQYDK2VwBCIEIM9iPpG2iktPM2m8C13KIaVw18DSPkbcUiG0r6nba/r8';
const PRIVATE_KEY_2_PKCS8 = 'MC4CAQAwBQYDK2VwBCIEIDY36wnxcI3F3bZGmcP/9ywXrdWQ0lvpw22MGmSohIHh';

// -- Raw record data (plain objects for crypto tests) -------------------------

type RawRecord = {
  readonly schemaVersion: number;
  readonly recordType: string;
  readonly recordId: string;
  readonly issuerKeyId: string;
  readonly issuedAt: string;
  readonly prev: string | null;
  readonly subject: Readonly<Record<string, string>>;
  readonly meta: Readonly<Record<string, string | number | boolean | null>>;
  readonly signature: { readonly alg: string; readonly sig: string };
};

const RAW_KEY_ADD_1: RawRecord = {
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: '3d4f7c3bb432678a6e28b3d07de8ad2a86a8c6cbaf037ac90cdd4aaf388abbb4',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:00:00Z',
  prev: null,
  subject: { keyId: KEY_ID_1, publicKey: PUBLIC_KEY_1 },
  meta: {},
  signature: {
    alg: 'ed25519',
    sig: 'tvE/r/do4UeNEnu3V1nzlACj/BEhM1BsjSI90SyslD5F62ov3S7yK62bDsGOkbIxvSkXjr+xDxYXJQw3PRtqCw==',
  },
};

const RAW_KEY_ADD_2: RawRecord = {
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: '8b9a16431641093790226915c471b10ce5928c065c4abc5a25e0d90cb2ba936a',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:01:00Z',
  prev: RAW_KEY_ADD_1.recordId,
  subject: { keyId: KEY_ID_2, publicKey: PUBLIC_KEY_2 },
  meta: {},
  signature: {
    alg: 'ed25519',
    sig: '3+vfNr9vIHmiM/YeivjHXo6BQ8qIG/xIehIisxBDkaihvLb8+jBU0bBFiurVceOWeFbCsZ3oq7Qy63H9FVMYBw==',
  },
};

const RAW_WRITER_BIND_ADD_ALICE: RawRecord = {
  schemaVersion: 1,
  recordType: 'WRITER_BIND_ADD',
  recordId: '70cc5fe9b9f0d12c4dc33ab7e9270702444f3b86b8be8785b966e449ffc889a8',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:02:00Z',
  prev: RAW_KEY_ADD_2.recordId,
  subject: { writerId: 'alice', keyId: KEY_ID_1 },
  meta: {},
  signature: {
    alg: 'ed25519',
    sig: 'c0y0ZlfC8jkqKjhzBPxPD5bcrSO3Cbq53Itdllvtwj6kYQJOA/duhWFyuKSnS5Gy6DXpN+cNYhPchCezY3GPCQ==',
  },
};

const RAW_KEY_REVOKE_2: RawRecord = {
  schemaVersion: 1,
  recordType: 'KEY_REVOKE',
  recordId: '4281dd3741f61c7d3afb21a458284406685484343696719429d8dc90165177f1',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:03:00Z',
  prev: RAW_WRITER_BIND_ADD_ALICE.recordId,
  subject: { keyId: KEY_ID_2, reasonCode: 'KEY_ROLLOVER' },
  meta: {},
  signature: {
    alg: 'ed25519',
    sig: 'U21euUseDykcEHLZJY4jMNYv7oyr1SNAu6SDs6ECgL/u2+p1GG+uvSfJ0xIHVpmTUMzx7UvLzy6Of71BnhEUAw==',
  },
};

const RAW_WRITER_BIND_REVOKE_BOB: RawRecord = {
  schemaVersion: 1,
  recordType: 'WRITER_BIND_REVOKE',
  recordId: 'f6646d48ee3bd4f2d85387fdad7711054249bc7e174b0c03b78dfa4ad20bdd5c',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:04:00Z',
  prev: RAW_KEY_REVOKE_2.recordId,
  subject: { writerId: 'bob', keyId: KEY_ID_2, reasonCode: 'KEY_REVOKED' },
  meta: {},
  signature: {
    alg: 'ed25519',
    sig: 'QjoO8Kg7dT2HxCeEyOoL6soJkUGEG2obrhwI1LD3n9gL8423eWa+W5PB9Jgpm0GC0cBt/PJECkHflE07b4g9DQ==',
  },
};

// -- Conversion helper --------------------------------------------------------

function toRecord(raw: RawRecord): TrustRecord {
  const decoded: DecodedTrustRecord = {
    ...raw,
    signaturePayload: textEncode(signaturePayload(raw)),
  };
  return TrustRecord.fromDecoded(decoded);
}

// -- Exported TrustRecord instances -------------------------------------------

const KEY_ADD_1 = toRecord(RAW_KEY_ADD_1);
const KEY_ADD_2 = toRecord(RAW_KEY_ADD_2);
const WRITER_BIND_ADD_ALICE = toRecord(RAW_WRITER_BIND_ADD_ALICE);
const KEY_REVOKE_2 = toRecord(RAW_KEY_REVOKE_2);
const WRITER_BIND_REVOKE_BOB = toRecord(RAW_WRITER_BIND_REVOKE_BOB);

const GOLDEN_CHAIN: readonly TrustRecord[] = [
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
];

const RECORDS_BY_ID: Readonly<Record<string, TrustRecord>> = Object.fromEntries(
  GOLDEN_CHAIN.map((r) => [r.recordId, r]),
);

export {
  // Key material
  PUBLIC_KEY_1,
  PUBLIC_KEY_2,
  KEY_ID_1,
  KEY_ID_2,
  PRIVATE_KEY_1_PKCS8,
  PRIVATE_KEY_2_PKCS8,
  // TrustRecord instances (use directly — no wrapping)
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
  GOLDEN_CHAIN,
  RECORDS_BY_ID,
  // Raw data (for crypto tests that need plain objects)
  RAW_KEY_ADD_1,
  RAW_KEY_ADD_2,
  RAW_WRITER_BIND_ADD_ALICE,
  RAW_KEY_REVOKE_2,
  RAW_WRITER_BIND_REVOKE_BOB,
};
export type { RawRecord };
