import type WarpWorldline from '../WarpWorldline.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import { executeReading } from './ReadingRuntime.ts';
import type Tick from './Tick.ts';
import { requireTickCoordinate } from './TickRuntime.ts';
import TimelineView from './TimelineView.ts';

export function createTimelineView(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  tick: Tick
): TimelineView {
  const coordinate = requireTickCoordinate(runtime, tick);
  return new TimelineView({
    name: runtime.worldlineName,
    writer: runtime.writerId,
    tick,
    readReading: async (reading) =>
      await executeReading({
        runtime,
        context,
        reading,
        basis: { optic: coordinate.optic(), tick },
      }),
  });
}
