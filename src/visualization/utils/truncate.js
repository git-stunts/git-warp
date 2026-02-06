import stringWidth from 'string-width';

export function truncate(str, maxWidth, ellipsis = '…') {
  const ellipsisWidth = stringWidth(ellipsis);

  // Guard degenerate cases
  if (maxWidth <= 0) {
    return '';
  }
  if (maxWidth <= ellipsisWidth) {
    return ellipsis.slice(0, maxWidth);
  }

  if (stringWidth(str) <= maxWidth) {
    return str;
  }

  let result = '';
  let width = 0;

  for (const char of str) {
    const charWidth = stringWidth(char);
    if (width + charWidth + ellipsisWidth > maxWidth) {break;}
    result += char;
    width += charWidth;
  }

  return result + ellipsis;
}

export default { truncate };
