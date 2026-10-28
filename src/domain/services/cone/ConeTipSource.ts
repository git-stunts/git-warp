/**
 * Supplies the writer tips a strand's cone basis folds up to (#1039): the
 * strand's base frontier plus the heads of the strand's own writer chains.
 */
export default abstract class ConeTipSource {
  /** Per writer, the patch the strand basis must fold up to. */
  abstract tips(): Promise<ReadonlyMap<string, string>>;
}
