import { describe, expect, it } from "vitest";
import { slugify } from "../src/lib/slug";

describe("slugify", () => {
  it("converts spaces to hyphens and lowercases", () => {
    expect(slugify("Section One")).toBe("section-one");
  });

  it("strips punctuation and non-word characters", () => {
    expect(slugify("What's New (2024)!")).toBe("whats-new-2024");
  });

  it("collapses repeated hyphens", () => {
    expect(slugify("A  B -- C")).toBe("a-b-c");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("- leading -")).toBe("leading");
    expect(slugify("trailing --")).toBe("trailing");
  });

  it("handles unicode letters", () => {
    expect(slugify("Résumé")).toBe("résumé");
  });

  it("is stable across preview and navigation usage", () => {
    const input = "My Big Heading!!!";
    expect(slugify(input)).toBe("my-big-heading");
    expect(slugify(input)).toBe(slugify(input.toLowerCase()));
  });
});