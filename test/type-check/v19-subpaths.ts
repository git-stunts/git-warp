/**
 * v19 explicit subpath consumer fixture -- compile-only.
 *
 * Advanced, charts, diagnostics, and testing imports stay reachable only from
 * their named expert surfaces.
 */

import {
  type Intent,
  type Lane,
  type Observer,
  type WriteReceipt,
} from '../../index.ts';
import {
  captureCoordinate,
  Coordinate,
  createObserver,
  intent,
  Optic,
  reading,
  type Witness,
} from '../../advanced.ts';
import { graph, GraphNeighborhoodChart, type GraphNeighborhoodOptions } from '../../charts.ts';
import {
  inspectReceipt,
  type ReceiptInspection,
  type ReceiptSubstrateInspection,
} from '../../diagnostics.ts';
import {
  createRuntimeHarness,
  type RuntimeHarness,
  type RuntimeHarnessOptions,
} from '../../testing.ts';

declare const lane: Lane;
const coordinate: InstanceType<typeof Coordinate> = await captureCoordinate(lane);
const optic: InstanceType<typeof Optic> = coordinate.optic();
const node = await optic.node('user:alice').read();
const witness: Witness = node.readIdentity;
const advancedIntent: Intent = intent.property.set({
  subject: 'user:alice',
  key: 'role',
  value: 'admin',
});
const advancedObserver: Observer<string> = createObserver(
  'users.role-of',
  reading.property({ subject: 'user:alice', key: 'role' }),
  (value) => {
    if (typeof value !== 'string') {
      throw new TypeError('users.role-of expected a string');
    }
    return value;
  },
);
declare const receipt: WriteReceipt;
const inspection: ReceiptInspection = inspectReceipt(receipt);
const inspectedLane: string = inspection.lane;
const substrate: ReceiptSubstrateInspection = inspection.substrate;
const neighborhoodOptions: GraphNeighborhoodOptions = {
  around: 'user:alice',
  direction: 'both',
  limit: 100,
};
const neighborhood = lane.observe(graph.neighborhood(neighborhoodOptions));
const chart: GraphNeighborhoodChart = (await neighborhood.one()).value;
const isRuntimeChart: boolean = chart instanceof GraphNeighborhoodChart;
const harnessOptions: RuntimeHarnessOptions = { writer: 'agent-1' };
const harness: RuntimeHarness = await createRuntimeHarness(harnessOptions);

// @ts-expect-error receipt inspection accepts no storage composition option.
inspectReceipt(receipt, { storage: null });

// @ts-expect-error diagnostic projections use canonical Lane vocabulary.
inspection.timeline;

await harness.close();
void optic;
void witness;
void advancedIntent;
void advancedObserver;
void inspection;
void inspectedLane;
void substrate;
void chart;
void isRuntimeChart;
