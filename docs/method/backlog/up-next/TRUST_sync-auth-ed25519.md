---
id: TRUST_sync-auth-ed25519
blocked_by: []
blocks: []
---

# Sync Auth: Migrate from Symmetric HMAC to Ed25519 Asymmetric Signatures

**Effort:** L

## Problem

`SyncAuthService.js` uses HMAC-SHA256 with a shared secret for sync request authentication. The nonce-reservation system (UUID + 5-minute clock-skew window + LRU cache) effectively prevents replay attacks, but the underlying cryptographic model is symmetric — all authorized nodes hold the same secret key.

In a multi-writer network, this means:

1. **Single point of compromise** — one node's key leak exposes the entire network
2. **No attribution** — HMAC proves the sender knows the secret, not *which* sender it is
3. **Key distribution problem** — adding a new writer requires secure distribution of the shared secret to all existing nodes
4. **No revocation** — revoking one writer's access means rotating the secret for everyone

## Fix

Migrate to Ed25519 asymmetric signatures:

- Each writer holds a private key; the network knows their public key
- Sync requests are signed with the sender's private key, verified with their public key
- Compromising one node exposes only that node's private key — blast radius is localized
- Writer revocation = remove their public key from the trust set, no secret rotation needed
- Attribution is inherent — the signature proves which specific writer sent the request

## Notes

- The trust subsystem already has key management infrastructure (`TrustRecordService`, `TrustEvaluator`, `TrustKeyStore`) — the sync auth migration should build on this, not create a parallel key system
- `@git-stunts/vault` handles OS-native keychain storage — private keys should go through Vault, not `.env` files
- The nonce-reservation + clock-skew mechanism is sound and should be preserved regardless of signature scheme
- Wire format change: sync request headers will carry a signature + public key ID instead of an HMAC tag. This is a breaking protocol change — needs versioned negotiation or a migration window where both are accepted
- `WebCryptoAdapter` already exists for multi-runtime crypto — Ed25519 is available via `crypto.subtle` in Node 20+, Bun, and Deno
- Consider: should the public key set be stored in the graph itself (as trust records) or out-of-band? The trust subsystem already stores writer trust assessments in-graph — public keys could follow the same pattern
