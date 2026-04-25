import {
  openWarpGraphRuntimeProduct,
  type WarpGraphRuntimeOpenOptions,
  type WarpGraphRuntimeSurface,
} from './WarpGraphRuntimeProduct.ts';

export type { WarpGraphRuntimeOpenOptions, WarpGraphRuntimeSurface } from './WarpGraphRuntimeProduct.ts';

export async function openWarpGraphRuntime(
  options: WarpGraphRuntimeOpenOptions,
): Promise<WarpGraphRuntimeSurface> {
  return await openWarpGraphRuntimeProduct(options);
}
