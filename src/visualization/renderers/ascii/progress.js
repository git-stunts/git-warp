import chalk from 'chalk';

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
