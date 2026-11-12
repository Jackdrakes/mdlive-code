import { describe, expect, it } from "vitest";
import { toggleTaskCheckbox } from "../src/lib/task-list";

describe("toggleTaskCheckbox", () => {
  it("toggles an unordered task without changing its indentation", () => {
    const source = "- [ ] top\n  * [x] nested";
    expect(toggleTaskCheckbox(source, 1)).toBe("- [ ] top\n  * [ ] nested");
  });

  it("supports ordered tasks and uppercase checked state", () => {
    expect(toggleTaskCheckbox("1. [X] done", 0)).toBe("1. [ ] done");
    expect(toggleTaskCheckbox("1. [ ] todo", 0)).toBe("1. [x] todo");
  });

  it("leaves non-task lines and invalid indexes unchanged", () => {
    const source = "plain text";
    expect(toggleTaskCheckbox(source, 0)).toBe(source);
    expect(toggleTaskCheckbox(source, 1)).toBe(source);
  });
});
