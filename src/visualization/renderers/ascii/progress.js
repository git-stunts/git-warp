import chalk from 'chalk';

export function progressBar(percent, width = 20, options = {}) {
  const { filled = '█', empty = '░', showPercent = true } = options;
  const filledCount = Math.round((percent / 100) * width);
  const emptyCount = width - filledCount;

  let bar = filled.repeat(filledCount) + empty.repeat(emptyCount);

  // Color based on value
  if (percent >= 80) {bar = chalk.green(bar);}
  else if (percent >= 50) {bar = chalk.yellow(bar);}
  else {bar = chalk.red(bar);}

  return showPercent ? `${bar} ${percent}%` : bar;
}

export default { progressBar };
