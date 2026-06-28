export interface DiffLine {
  type: "equal" | "added" | "removed";
  value: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface LcsEntry {
  oldIdx: number;
  newIdx: number;
}

function longestCommonSubsequence<T>(a: T[], b: T[], eq: (x: T, y: T) => boolean): LcsEntry[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (eq(a[i - 1], b[j - 1])) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: LcsEntry[] = [];
  let i = m, j = n;
  while (i > 0 && j > 0) {
    if (eq(a[i - 1], b[j - 1])) {
      result.unshift({ oldIdx: i - 1, newIdx: j - 1 });
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

export function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  if (oldText === newText) {
    return oldLines.map((line, i) => ({
      type: "equal" as const,
      value: line,
      oldLineNum: i + 1,
      newLineNum: i + 1,
    }));
  }

  const lcs = longestCommonSubsequence(oldLines, newLines, (x, y) => x === y);
  const result: DiffLine[] = [];

  let oldI = 0, newI = 0;
  for (const entry of lcs) {
    while (oldI < entry.oldIdx) {
      result.push({ type: "removed", value: oldLines[oldI], oldLineNum: oldI + 1 });
      oldI++;
    }
    while (newI < entry.newIdx) {
      result.push({ type: "added", value: newLines[newI], newLineNum: newI + 1 });
      newI++;
    }
    result.push({ type: "equal", value: oldLines[entry.oldIdx], oldLineNum: oldI + 1, newLineNum: newI + 1 });
    oldI++;
    newI++;
  }

  while (oldI < oldLines.length) {
    result.push({ type: "removed", value: oldLines[oldI], oldLineNum: oldI + 1 });
    oldI++;
  }
  while (newI < newLines.length) {
    result.push({ type: "added", value: newLines[newI], newLineNum: newI + 1 });
    newI++;
  }

  return result;
}
