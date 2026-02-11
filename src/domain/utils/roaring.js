/**
 * Lazy-loading wrapper for the roaring-wasm/roaring native bitmap library.
 *
 * This module provides deferred loading of the `roaring` npm package to avoid
 * incurring the startup cost of loading native C++ bindings until they are
 * actually needed. The roaring package provides highly efficient compressed
 * bitmap data structures used by the bitmap index system for O(1) neighbor lookups.
 *
 * ## Why Lazy Loading?
 *
 * The `roaring` package includes native C++ bindings that can take 50-100ms to
 * initialize on cold start. By deferring the load until first use,
 * applications that don't use bitmap indexes avoid this overhead entirely.
 *
 * ## Module Caching
 *
 * Once loaded, the module reference is cached in `roaringModule` and reused
 * for all subsequent calls. Similarly, native availability is cached after
 * the first check to avoid repeated introspection.
 *
 * @module roaring
 * @see BitmapIndexBuilder - Primary consumer of roaring bitmaps
 * @see StreamingBitmapIndexBuilder - Memory-bounded variant
 */

/**
 * Sentinel indicating availability has not been checked yet.
 * @const {symbol}
 * @private
 */
const NOT_CHECKED = Symbol('NOT_CHECKED');

/**
 * Cached reference to the loaded roaring module.
 * @type {any} // TODO(ts-cleanup): type lazy singleton
 * @private
 */
let roaringModule = null;

/**
 * Cached result of native availability check.
 * `NOT_CHECKED` means not yet checked, `null` means indeterminate.
 * @type {boolean|symbol|null}
 * @private
 */
let nativeAvailability = NOT_CHECKED;

/**
 * Lazily loads and caches the roaring module.
 *
 * Uses a top-level-await-friendly pattern with dynamic import.
 * The module is cached after first load.
 *
 * @returns {any} The roaring module exports
 * @throws {Error} If the roaring package is not installed or fails to load
 * @private
 */
function loadRoaring() {
  if (!roaringModule) {
    throw new Error('Roaring module not loaded. Call initRoaring() first or ensure top-level await import completed.');
  }
  return roaringModule;
}

/**
 * Initializes the roaring module. Must be called before getRoaringBitmap32().
 * This is called automatically via top-level await when the module is imported,
 * but can also be called manually with a pre-loaded module for testing.
 *
 * @param {Object} [mod] - Pre-loaded roaring module (for testing/DI)
 * @returns {Promise<void>}
 */
export async function initRoaring(mod) {
  if (mod) {
    roaringModule = mod;
    return;
  }
  if (!roaringModule) {
    roaringModule = await import('roaring');
    // Handle both ESM default export and CJS module.exports
    if (roaringModule.default && roaringModule.default.RoaringBitmap32) {
      roaringModule = roaringModule.default;
    }
  }
}

// Auto-initialize on module load (top-level await)
try {
  await initRoaring();
} catch {
  // Roaring may not be installed; functions will throw on use
}

/**
 * Returns the RoaringBitmap32 class from the roaring library.
 *
 * RoaringBitmap32 is a compressed bitmap implementation that provides
 * efficient set operations (union, intersection, difference) on large
 * sets of 32-bit integers. It's used by the bitmap index system to
 * store edge adjacency lists in a highly compressed format.
 *
 * @returns {typeof import('roaring').RoaringBitmap32} The RoaringBitmap32 constructor
 * @throws {Error} If the roaring package is not installed
 *
 * @example
 * const RoaringBitmap32 = getRoaringBitmap32();
 * const bitmap = new RoaringBitmap32([1, 2, 3, 100, 1000]);
 * bitmap.has(100); // true
 * bitmap.size; // 5
 *
 * @example
 * // Set operations
 * const a = new RoaringBitmap32([1, 2, 3]);
 * const b = new RoaringBitmap32([2, 3, 4]);
 * const union = RoaringBitmap32.or(a, b); // [1, 2, 3, 4]
 * const intersection = RoaringBitmap32.and(a, b); // [2, 3]
 */
export function getRoaringBitmap32() {
  return loadRoaring().RoaringBitmap32;
}

/**
 * Checks whether the native C++ roaring implementation is available.
 *
 * The `roaring` package can operate in two modes:
 * - **Native mode**: Uses prebuilt C++ bindings for maximum performance
 * - **WASM fallback**: Uses WebAssembly when native bindings aren't available
 *
 * This function checks which mode is active by introspecting the loaded
 * module. The result is cached after the first call.
 *
 * @returns {boolean|null} `true` if native bindings are installed,
 *   `false` if using WASM fallback or if loading failed,
 *   `null` if the installation status could not be determined
 *
 * @example
 * if (getNativeRoaringAvailable()) {
 *   console.log('Using native roaring bindings (fastest)');
 * } else if (getNativeRoaringAvailable() === false) {
 *   console.log('Using WASM fallback (slower but portable)');
 * } else {
 *   console.log('Could not determine roaring installation type');
 * }
 *
 * @example
 * // Useful for diagnostics and performance tuning
 * const diagnostics = {
 *   roaringNative: getNativeRoaringAvailable(),
 *   // ... other system info
 * };
 */
export function getNativeRoaringAvailable() {
  if (nativeAvailability !== NOT_CHECKED) {
    return /** @type {boolean|null} */ (nativeAvailability);
  }

  try {
    const roaring = loadRoaring();
    const { RoaringBitmap32 } = roaring;

    // Try the method-based API first (roaring >= 2.x)
    if (typeof RoaringBitmap32.isNativelyInstalled === 'function') {
      nativeAvailability = RoaringBitmap32.isNativelyInstalled();
      return /** @type {boolean|null} */ (nativeAvailability);
    }

    // Fall back to property-based API (roaring 1.x)
    if (roaring.isNativelyInstalled !== undefined) {
      nativeAvailability = roaring.isNativelyInstalled;
      return /** @type {boolean|null} */ (nativeAvailability);
    }

    // Could not determine - leave as null (indeterminate)
    nativeAvailability = null;
    return nativeAvailability;
  } catch {
    // Loading failed entirely - definitely not available
    nativeAvailability = false;
    return nativeAvailability;
  }
}
