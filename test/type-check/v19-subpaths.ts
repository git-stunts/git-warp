/**
 * v19 explicit subpath consumer fixture -- compile-only.
 *
 * Storage, advanced, and diagnostics imports stay reachable only from their
 * named expert surfaces.
 */

import {
  GitStorageAdapter,
  MemoryStorageAdapter,
  type GitStorageAdapterOptions,
} from '../../storage.ts';
import { type Receipt, type Timeline } from '../../index.ts';
import { Coordinate, Optic, type Witness } from '../../advanced.ts';
import { inspectReceipt, type ReceiptInspection } from '../../diagnostics.ts';

declare const gitStorageOptions: GitStorageAdapterOptions;

const storageAdapter = new MemoryStorageAdapter();
const gitStorageAdapter = new GitStorageAdapter(gitStorageOptions);
declare const timeline: Timeline;
const coordinate: InstanceType<typeof Coordinate> = await timeline.coordinate();
const optic: InstanceType<typeof Optic> = coordinate.optic();
const node = await optic.node('user:alice').read();
const witness: Witness = node.readIdentity;
declare const receipt: Receipt;
const inspection: ReceiptInspection = inspectReceipt(receipt);

void storageAdapter;
void gitStorageAdapter;
void optic;
void witness;
void inspection;
