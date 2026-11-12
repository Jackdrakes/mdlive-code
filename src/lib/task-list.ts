const TASK_CHECKBOX_RE = /^(\s*)([-+*]|\d+[.)])(\s+)\[([ xX])\](\s*)/;

export function toggleTaskCheckbox(content: string, lineIndex: number): string {
  const lines = content.split("\n");
  const line = lines[lineIndex];
  if (line === undefined) return content;

  const match = line.match(TASK_CHECKBOX_RE);
  if (!match) return content;

  const nextState = match[4].toLowerCase() === "x" ? " " : "x";
  lines[lineIndex] = `${match[1]}${match[2]}${match[3]}[${nextState}]${match[5]}${line.slice(match[0].length)}`;
  return lines.join("\n");
}
