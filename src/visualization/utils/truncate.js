import stringWidth from 'string-width';

export function truncate(str, maxWidth, ellipsis = '…') {
  if (stringWidth(str) <= maxWidth) {return str;}

  let result = '';
  let width = 0;
  const ellipsisWidth = stringWidth(ellipsis);

  for (const char of str) {
    const charWidth = stringWidth(char);
    if (width + charWidth + ellipsisWidth > maxWidth) {break;}
    result += char;
    width += charWidth;
  }

  return result + ellipsis;
}

export default { truncate };
