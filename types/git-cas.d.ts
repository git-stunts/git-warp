/**
 * Type stub for @git-stunts/git-cas (optional dependency, Node >= 22 only).
 *
 * Provides just enough shape for CasSeekCacheAdapter to typecheck on
 * runtimes where the package is not installed.
 */
declare module '@git-stunts/git-cas' {
  interface CasStore {
    put(key: string, value: Uint8Array): Promise<string>;
    get(key: string): Promise<Uint8Array | null>;
    has(key: string): Promise<boolean>;
    delete(key: string): Promise<boolean>;
  }

  interface ContentAddressableStore {
    createCbor(opts: { plumbing: unknown }): CasStore;
  }

  const ContentAddressableStore: ContentAddressableStore;
  export default ContentAddressableStore;
}
