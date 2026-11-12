export interface TextEdit {
  startOffset: number;
  endOffset: number;
  newText: string;
}

/** Returns the smallest single replacement that transforms oldText into newText. */
export function computeTextEdit(oldText: string, newText: string): TextEdit | null {
  if (oldText === newText) return null;

  let prefix = 0;
  const sharedLength = Math.min(oldText.length, newText.length);
  while (prefix < sharedLength && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - suffix - 1] === newText[newText.length - suffix - 1]
  ) {
    suffix++;
  }

  return {
    startOffset: prefix,
    endOffset: oldText.length - suffix,
    newText: newText.slice(prefix, newText.length - suffix),
  };
}
