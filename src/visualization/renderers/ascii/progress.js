import chalk from 'chalk';

/**
 * Renders a colored progress bar string.
 *
 * Color thresholds: green >= 80%, yellow >= 50%, red < 50%.
 *
 * @param {number} percent - Percentage value (clamped to 0-100)
 * @param {number} [width=20] - Character width of the bar
 * @param {Object} [options] - Display options
 * @param {string} [options.filled='█'] - Character for filled segments
 * @param {string} [options.empty='░'] - Character for empty segments
 * @param {boolean} [options.showPercent=true] - Whether to append the percentage value
 * @returns {string} The rendered progress bar with ANSI colors
 */
export function progressBar(percent, width = 20, options = {}) {
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const { filled = '█', empty = '░', showPercent = true } = options;
  const filledCount = Math.round((clampedPercent / 100) * width);
  const emptyCount = width - filledCount;

  let bar = filled.repeat(filledCount) + empty.repeat(emptyCount);

  // Color based on value
  if (clampedPercent >= 80) {bar = chalk.green(bar);}
  else if (clampedPercent >= 50) {bar = chalk.yellow(bar);}
  else {bar = chalk.red(bar);}

  return showPercent ? `${bar} ${clampedPercent}%` : bar;
}

export default { progressBar };
