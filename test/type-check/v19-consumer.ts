/**
 * v19 consumer smoke test -- compile-only.
 *
 * Exercises the root application API plus explicit storage subpath.
 */

import {
  openWarp,
  Timeline,
  Warp,
  type OpenWarpOptions,
  type WarpStorage,
} from '../../index.ts';
import { MemoryStorageAdapter } from '../../storage.ts';

const storage = new MemoryStorageAdapter();
const publicStorage: WarpStorage = storage;

const options: OpenWarpOptions = {
  storage: publicStorage,
  writer: 'agent-1',
};

const warp: Warp = await openWarp(options);
const timeline: Timeline = await warp.timeline('events');
const timelineName: string = timeline.name;
const timelineWriter: string = timeline.writer;

// @ts-expect-error timelines do not expose legacy worldline names.
timeline.worldlineName;

// @ts-expect-error timelines do not expose legacy writer ids.
timeline.writerId;

// @ts-expect-error timelines do not expose patch commits.
timeline.commit;

void timelineName;
void timelineWriter;
