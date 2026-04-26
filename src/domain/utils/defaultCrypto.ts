/**
 * Default CryptoPort singleton for domain services.
 *
 * Provides SHA hashing, HMAC, and timing-safe comparison. The
 * platform binding (`NodeCryptoAdapter` over `node:crypto`) is
 * loaded through a **dynamic top-level import** so this module
 * does not reach Node platform APIs directly. That keeps the
 * hexagonal wall intact at static analysis time: nothing in this
 * file statically imports from `node:*` or
 * `src/infrastructure/**`.
 *
 * The dynamic import still runs at module-load time (top-level
 * await), preserving the pre-0025D behavior where the platform
 * binding is resolved exactly once before the first caller uses
 * the singleton. In a Node / Bun / Deno runtime, the adapter loads
 * normally. In runtimes where `node:crypto` is stubbed (e.g. Vite
 * browser bundles), the dynamic import rejects at load time and
 * every method on this singleton throws a `CryptoError` at call
 * time — the caller must then inject a `CryptoPort` explicitly
 * (for example `WebCryptoAdapter`).
 *
 * Relocated patterning: pre-cycle-0025D this file imported Node crypto
 * types directly and loaded the same platform module dynamically. The
 * static type import was the quarantined violation. Cycle 0025D removes
 * the static platform surface and switches the dynamic binding to the
 * existing `NodeCryptoAdapter`, which is the only file authorized to
 * import `node:crypto`. Runtime behavior is preserved.
 *
 * @module domain/utils/defaultCrypto
 */

import CryptoPort from '../../ports/CryptoPort.ts';
import CryptoError from '../errors/CryptoError.ts';

const UNAVAILABLE_MESSAGE = 'No crypto available. Inject a CryptoPort explicitly.';

/**
 * Platform binding resolved at module-load time. `null` means the
 * dynamic import rejected (bundler stub, unsupported runtime) —
 * every method below surfaces that as a `CryptoError`.
 */
let _impl: CryptoPort | null = null;

try {
  const mod = await import('../../infrastructure/adapters/NodeCryptoAdapter.ts');
  _impl = new mod.default();
} catch {
  // Dynamic import failed (bundler stub, unsupported runtime, etc.)
  // — caller must inject a CryptoPort explicitly.
}

function requireImpl(): CryptoPort {
  if (_impl === null) {
    throw new CryptoError(UNAVAILABLE_MESSAGE);
  }
  return _impl;
}

class DefaultCrypto extends CryptoPort {
  async hash(algorithm: string, data: string | Uint8Array): Promise<string> {
    return await requireImpl().hash(algorithm, data);
  }

  async hmac(algorithm: string, key: string | Uint8Array, data: string | Uint8Array): Promise<Uint8Array> {
    return await requireImpl().hmac(algorithm, key, data);
  }

  timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    return requireImpl().timingSafeEqual(a, b);
  }
}

const defaultCrypto = new DefaultCrypto();
Object.freeze(defaultCrypto);

export default defaultCrypto;
