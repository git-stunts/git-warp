import chalk from 'chalk';

/**
 * Applies color to a bar string based on percentage thresholds.
 * Green >= 80%, yellow >= 50%, red < 50%.
 * @param {string} bar - The raw bar string
 * @param {number} pct - The percentage value
 * @returns {string} Colored bar string
 */
function colorizeBar(bar, pct) {
  if (pct >= 80) {
    return chalk.green(bar);
  }
  if (pct >= 50) {
    return chalk.yellow(bar);
  }
  return chalk.red(bar);
}

/**
 * Resolves progress bar display options with defaults.
 * @param {{ filled?: string, empty?: string, showPercent?: boolean }} opts
 * @returns {{ filled: string, empty: string, showPercent: boolean }}
 */
function resolveBarOptions(opts) {
  return {
    filled: opts.filled ?? '█',
    empty: opts.empty ?? '░',
    showPercent: opts.showPercent ?? true,
  };
}

/**
 * Renders a colored progress bar string.
 *
 * Color thresholds: green >= 80%, yellow >= 50%, red < 50%.
 *
 * @param {number} percent - Percentage value (clamped to 0-100)
 * @param {number} [width=20] - Character width of the bar
 * @param {{ filled?: string, empty?: string, showPercent?: boolean }} [options] - Display options
 * @returns {string} The rendered progress bar with ANSI colors
 */
export function progressBar(percent, width = 20, options = {}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const { filled, empty, showPercent } = resolveBarOptions(options);
  const filledCount = Math.round((clampedPercent / 100) * width);
  const emptyCount = width - filledCount;

  const bar = colorizeBar(filled.repeat(filledCount) + empty.repeat(emptyCount), clampedPercent);

  return showPercent ? `${bar} ${clampedPercent}%` : bar;
}

export default { progressBar };
