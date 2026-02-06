import stringWidth from 'string-width';

export function padRight(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  return str + char.repeat(width - currentWidth);
}

export function padLeft(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  return char.repeat(width - currentWidth) + str;
}

export function center(str, width, char = ' ') {
  const currentWidth = stringWidth(str);
  if (currentWidth >= width) {return str;}
  const padding = width - currentWidth;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return char.repeat(left) + str + char.repeat(right);
}

export default { padRight, padLeft, center, stringWidth };
