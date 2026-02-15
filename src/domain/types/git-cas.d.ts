/**
 * Type stub for @git-stunts/git-cas.
 *
 * Provides just enough shape for CasSeekCacheAdapter to typecheck.
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
