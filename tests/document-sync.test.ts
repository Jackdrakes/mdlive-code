import { describe, expect, it } from "vitest";
import { computeTextEdit } from "../src/lib/document-sync";

function applyEdit(text: string, edit: ReturnType<typeof computeTextEdit>): string {
  if (!edit) return text;
  return text.slice(0, edit.startOffset) + edit.newText + text.slice(edit.endOffset);
}

describe("computeTextEdit", () => {
  it("returns no edit for identical content", () => {
    expect(computeTextEdit("same", "same")).toBeNull();
  });

  it.each([
    ["hello", "hello world"],
    ["hello world", "hello"],
    ["one\ntwo", "one\nchanged"],
    ["a\nb\nc", "a\nx\nb\ny\nc"],
    ["before after", "before new after"],
    ["", "new content"],
  ])("transforms %j into %j", (oldText, newText) => {
    expect(applyEdit(oldText, computeTextEdit(oldText, newText))).toBe(newText);
  });
});
