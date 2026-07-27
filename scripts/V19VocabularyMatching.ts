export function containsVocabularyPhrase(
  candidate: readonly string[],
  forbidden: readonly string[],
): boolean {
  for (
    let start = 0;
    start + forbidden.length <= candidate.length;
    start += 1
  ) {
    if (forbidden.every(
      (token, offset) => vocabularyTokenMatches(
        candidate[start + offset],
        token,
      ),
    )) {
      return true;
    }
  }
  return false;
}

export function vocabularyTokens(value: string): readonly string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((token) => token.length > 0)
    .map((token) => token.toLowerCase());
}

function vocabularyTokenMatches(
  candidate: string | undefined,
  forbidden: string,
): boolean {
  return candidate === forbidden
    || (
      candidate?.endsWith('s') === true
      && candidate.slice(0, -1) === forbidden
    );
}
