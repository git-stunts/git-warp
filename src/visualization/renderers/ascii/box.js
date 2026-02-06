import boxen from 'boxen';

export function createBox(content, options = {}) {
  return boxen(content, {
    padding: 1,
    borderStyle: 'double',
    ...options,
  });
}

export default { createBox };
