/**
 * v19 explicit subpath consumer fixture -- compile-only.
 *
 * Storage, advanced, and diagnostics imports stay reachable only from their
 * named expert surfaces.
 */

import { GitStorage, type GitStorageOptions } from '../../storage.ts';
import { type Receipt, type Timeline } from '../../index.ts';
import { captureCoordinate, Coordinate, Optic, type Witness } from '../../advanced.ts';
import {
  inspectReceipt,
  type InspectReceiptOptions,
  type ReceiptInspection,
  type ReceiptSubstrateInspection,
} from '../../diagnostics.ts';

declare const gitStorageOptions: GitStorageOptions;

const gitStorage = await GitStorage.open(gitStorageOptions);
declare const timeline: Timeline;
const coordinate: InstanceType<typeof Coordinate> = await captureCoordinate(timeline);
const optic: InstanceType<typeof Optic> = coordinate.optic();
const node = await optic.node('user:alice').read();
const witness: Witness = node.readIdentity;
declare const receipt: Receipt;
const inspectionOptions: InspectReceiptOptions = { storage: gitStorage };
const inspection: ReceiptInspection = inspectReceipt(receipt, inspectionOptions);
const substrate: ReceiptSubstrateInspection = inspection.substrate;

// @ts-expect-error diagnostics require explicit storage context.
inspectReceipt(receipt);

await gitStorage.close();
void optic;
void witness;
void inspection;
void substrate;
