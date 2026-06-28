export function countWords(text: string): number {
  if (!text || text.trim() === "") return 0;
  return text.trim().split(/\s+/).filter((word) => word.length > 0).length;
}

export function countCharacters(text: string): number {
  return text.length;
}
