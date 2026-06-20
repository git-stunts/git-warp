import {
  openWarpGraphRuntimeProduct,
  type WarpGraphRuntimeOpenInput,
  type WarpGraphRuntimeSurface,
} from './WarpGraphRuntimeProduct.ts';

export type {
  WarpGraphRuntimeOpenInput,
  WarpGraphRuntimeOpenOptions,
  WarpGraphRuntimeSurface,
} from './WarpGraphRuntimeProduct.ts';

export async function openWarpGraphRuntime(
  options: WarpGraphRuntimeOpenInput,
): Promise<WarpGraphRuntimeSurface> {
  return await openWarpGraphRuntimeProduct(options);
}
