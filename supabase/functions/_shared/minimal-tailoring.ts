export const MAX_REMINDER_WORDS = 40;

function words(value: string): string[] {
  return value.toLocaleLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}

const REFERENCE_STOP_WORDS = new Set([
  'a', 'an', 'and', 'at', 'for', 'from', 'in', 'is', 'it', 'my', 'of', 'on',
  'the', 'this', 'to', 'with',
]);

function referenceWords(value: string): string[] {
  return words(value).filter((word) => !REFERENCE_STOP_WORDS.has(word));
}

function wordsMatch(left: string, right: string): boolean {
  if (left === right) return true;
  if (left.length < 4 || right.length < 4) return false;

  // Permit small grammatical changes such as need/needing, leave/leaving,
  // deadline/deadlines, or rushed/rushing without treating unrelated words as
  // a clear reference to the custom distraction.
  let commonPrefixLength = 0;
  const limit = Math.min(left.length, right.length);
  while (commonPrefixLength < limit && left[commonPrefixLength] === right[commonPrefixLength]) {
    commonPrefixLength += 1;
  }
  return commonPrefixLength >= 4
    && commonPrefixLength >= Math.min(left.length, right.length) - 1;
}

function clearlyReferencesDistraction(reminder: string, distraction: string): boolean {
  const reminderWords = referenceWords(reminder);
  const distractionWords = referenceWords(distraction);
  if (!reminderWords.length || !distractionWords.length) return false;

  const matchedWords = distractionWords.filter((word) =>
    reminderWords.some((reminderWord) => wordsMatch(word, reminderWord))
  ).length;
  return matchedWords >= Math.max(1, Math.ceil(distractionWords.length / 2));
}

function longestCommonSubsequenceLength(left: string[], right: string[]): number {
  const previous = new Array(right.length + 1).fill(0);
  const current = new Array(right.length + 1).fill(0);

  for (const leftWord of left) {
    for (let index = 1; index <= right.length; index += 1) {
      current[index] = leftWord === right[index - 1]
        ? previous[index - 1] + 1
        : Math.max(previous[index], current[index - 1]);
    }
    for (let index = 0; index <= right.length; index += 1) {
      previous[index] = current[index];
      current[index] = 0;
    }
  }

  return previous[right.length];
}

/**
 * Reject creative rewrites even if the model ignored the minimal-edit prompt.
 * A valid result must clearly reference the custom distraction, retain at
 * least 70% of the base reminder's words in order, and add only enough room to
 * weave in that distraction naturally.
 */
export function isMinimalTailoring(
  baseReminder: string,
  reminder: string,
  distraction: string,
): boolean {
  const baseWords = words(baseReminder);
  const reminderWords = words(reminder);
  const distractionWords = words(distraction);
  if (!baseWords.length || !reminderWords.length || !distractionWords.length) return false;

  const retainedBaseRatio = longestCommonSubsequenceLength(baseWords, reminderWords) / baseWords.length;
  const allowedWords = Math.min(
    MAX_REMINDER_WORDS,
    baseWords.length + distractionWords.length + 4,
  );

  return clearlyReferencesDistraction(reminder, distraction)
    && retainedBaseRatio >= 0.7
    && reminderWords.length <= allowedWords;
}

export function conservativeTailoring(baseReminder: string, distraction: string): string {
  return `You often struggle with "${distraction}" for this Salah. ${baseReminder}`;
}
