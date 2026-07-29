import { progressBar, stripAnsi, type BijouContext } from '@flyingrobots/bijou';

/** Render bounded migration progress through Bijou for insertion in a Surface. */
export function renderV18MigrationProgressBar(
  context: BijouContext,
  percent: number,
  completed: number,
  total: number,
  width: number
): string {
  const label = ` ${String(completed)}/${String(total)} ${percent.toFixed(1)}%`;
  const barWidth = Math.max(4, Math.min(42, width - label.length - 2));
  const bar = progressBar(percent, {
    ctx: context,
    empty: '░',
    filled: '█',
    showPercent: false,
    width: barWidth,
  });
  return `${stripAnsi(bar)}${label}`;
}
