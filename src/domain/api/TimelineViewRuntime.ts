import type WarpWorldline from '../WarpWorldline.ts';
import { executeReading } from './ReadingRuntime.ts';
import type Tick from './Tick.ts';
import { requireTickCoordinate } from './TickRuntime.ts';
import TimelineView from './TimelineView.ts';

export function createTimelineView(runtime: WarpWorldline, tick: Tick): TimelineView {
  const coordinate = requireTickCoordinate(runtime, tick);
  return new TimelineView({
    name: runtime.worldlineName,
    writer: runtime.writerId,
    tick,
    readReading: async (reading) => await executeReading(runtime, reading, coordinate.optic()),
  });
}
