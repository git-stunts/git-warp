/**
 * Golden canonical fixtures for Trust V1 tests.
 *
 * These records are pre-computed with real Ed25519 signatures and
 * pinned recordId digests. All downstream tests consume these fixtures
 * rather than generating fresh crypto on each run.
 *
 * Chain order: keyAdd1 → keyAdd2 → writerBindAdd → keyRevoke → writerBindRevoke
 *
 * @module test/unit/domain/trust/fixtures/goldenRecords
 */

// ── Key material ────────────────────────────────────────────────────────────

/** Base64-encoded 32-byte Ed25519 raw public key (key 1 — root) */
export const PUBLIC_KEY_1 = 'iNP+GiMyG/n678w8SjU44SxetetK4DoEESjC5X8NGkc=';

/** Base64-encoded 32-byte Ed25519 raw public key (key 2 — secondary) */
export const PUBLIC_KEY_2 = 'uqewhqMC1oyVPsMhn8Vmrkt+SNlY2AA2/WogFOsfEME=';

/** Fingerprint of key 1: ed25519:sha256(rawBytes) */
export const KEY_ID_1 = 'ed25519:3f07070d046593892c24c2875aa3e03fa877c4cbb66b246d6a867aa3fc66b5b9';

/** Fingerprint of key 2: ed25519:sha256(rawBytes) */
export const KEY_ID_2 = 'ed25519:e0c7d43725576d9c0582bb4884b2906cda1bb2f7c156417e53166d7a59b73d92';

/** PKCS8 DER private key for key 1 (base64). Only used in sign+verify round-trip tests. */
export const PRIVATE_KEY_1_PKCS8 = 'MC4CAQAwBQYDK2VwBCIEIM9iPpG2iktPM2m8C13KIaVw18DSPkbcUiG0r6nba/r8';

/** PKCS8 DER private key for key 2 (base64). Only used in sign+verify round-trip tests. */
export const PRIVATE_KEY_2_PKCS8 = 'MC4CAQAwBQYDK2VwBCIEIDY36wnxcI3F3bZGmcP/9ywXrdWQ0lvpw22MGmSohIHh';

// ── Records (chain order) ───────────────────────────────────────────────────

/** Record 1: KEY_ADD for root key (genesis — prev=null) */
export const KEY_ADD_1 = Object.freeze({
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: '3d4f7c3bb432678a6e28b3d07de8ad2a86a8c6cbaf037ac90cdd4aaf388abbb4',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:00:00Z',
  prev: null,
  subject: Object.freeze({ keyId: KEY_ID_1, publicKey: PUBLIC_KEY_1 }),
  meta: Object.freeze({}),
  signature: Object.freeze({
    alg: 'ed25519',
    sig: 'tvE/r/do4UeNEnu3V1nzlACj/BEhM1BsjSI90SyslD5F62ov3S7yK62bDsGOkbIxvSkXjr+xDxYXJQw3PRtqCw==',
  }),
});

/** Record 2: KEY_ADD for secondary key (signed by root) */
export const KEY_ADD_2 = Object.freeze({
  schemaVersion: 1,
  recordType: 'KEY_ADD',
  recordId: '8b9a16431641093790226915c471b10ce5928c065c4abc5a25e0d90cb2ba936a',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:01:00Z',
  prev: KEY_ADD_1.recordId,
  subject: Object.freeze({ keyId: KEY_ID_2, publicKey: PUBLIC_KEY_2 }),
  meta: Object.freeze({}),
  signature: Object.freeze({
    alg: 'ed25519',
    sig: '3+vfNr9vIHmiM/YeivjHXo6BQ8qIG/xIehIisxBDkaihvLb8+jBU0bBFiurVceOWeFbCsZ3oq7Qy63H9FVMYBw==',
  }),
});

/** Record 3: WRITER_BIND_ADD — bind alice to root key */
export const WRITER_BIND_ADD_ALICE = Object.freeze({
  schemaVersion: 1,
  recordType: 'WRITER_BIND_ADD',
  recordId: '70cc5fe9b9f0d12c4dc33ab7e9270702444f3b86b8be8785b966e449ffc889a8',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:02:00Z',
  prev: KEY_ADD_2.recordId,
  subject: Object.freeze({ writerId: 'alice', keyId: KEY_ID_1 }),
  meta: Object.freeze({}),
  signature: Object.freeze({
    alg: 'ed25519',
    sig: 'c0y0ZlfC8jkqKjhzBPxPD5bcrSO3Cbq53Itdllvtwj6kYQJOA/duhWFyuKSnS5Gy6DXpN+cNYhPchCezY3GPCQ==',
  }),
});

/** Record 4: KEY_REVOKE — revoke secondary key */
export const KEY_REVOKE_2 = Object.freeze({
  schemaVersion: 1,
  recordType: 'KEY_REVOKE',
  recordId: '4281dd3741f61c7d3afb21a458284406685484343696719429d8dc90165177f1',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:03:00Z',
  prev: WRITER_BIND_ADD_ALICE.recordId,
  subject: Object.freeze({ keyId: KEY_ID_2, reasonCode: 'KEY_ROLLOVER' }),
  meta: Object.freeze({}),
  signature: Object.freeze({
    alg: 'ed25519',
    sig: 'U21euUseDykcEHLZJY4jMNYv7oyr1SNAu6SDs6ECgL/u2+p1GG+uvSfJ0xIHVpmTUMzx7UvLzy6Of71BnhEUAw==',
  }),
});

/** Record 5: WRITER_BIND_REVOKE — revoke bob's binding to key 2 */
export const WRITER_BIND_REVOKE_BOB = Object.freeze({
  schemaVersion: 1,
  recordType: 'WRITER_BIND_REVOKE',
  recordId: 'f6646d48ee3bd4f2d85387fdad7711054249bc7e174b0c03b78dfa4ad20bdd5c',
  issuerKeyId: KEY_ID_1,
  issuedAt: '2025-06-15T12:04:00Z',
  prev: KEY_REVOKE_2.recordId,
  subject: Object.freeze({ writerId: 'bob', keyId: KEY_ID_2, reasonCode: 'KEY_REVOKED' }),
  meta: Object.freeze({}),
  signature: Object.freeze({
    alg: 'ed25519',
    sig: 'QjoO8Kg7dT2HxCeEyOoL6soJkUGEG2obrhwI1LD3n9gL8423eWa+W5PB9Jgpm0GC0cBt/PJECkHflE07b4g9DQ==',
  }),
});

/** Full chain in order (oldest first). */
export const GOLDEN_CHAIN = Object.freeze([
  KEY_ADD_1,
  KEY_ADD_2,
  WRITER_BIND_ADD_ALICE,
  KEY_REVOKE_2,
  WRITER_BIND_REVOKE_BOB,
]);

/** Map of recordId → record for quick lookup. */
export const RECORDS_BY_ID = Object.freeze(
  Object.fromEntries(GOLDEN_CHAIN.map((r) => [r.recordId, r])),
);
