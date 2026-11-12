import { describe, expect, it } from "vitest";
import * as path from "path";
import { fileURLToPath } from "url";
import { VaultIndex } from "../src/lib/vault-index";

const VAULT = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "vault");

describe("VaultIndex", () => {
  it("caches a scan per vault root", async () => {
    const first = await VaultIndex.getMdFiles(VAULT);
    const second = await VaultIndex.getMdFiles(VAULT);
    expect(first.sort()).toEqual(expect.arrayContaining(second.sort()));
    expect(second).toEqual(first);
  });

  it("discovers markdown files recursively", async () => {
    const files = (await VaultIndex.getMdFiles(VAULT)).map((f) => path.relative(VAULT, f)).sort();
    expect(files).toEqual([
      "index.md",
      path.join("notes", "deep", "file-a.md"),
      path.join("notes", "meeting-notes.md"),
      path.join("projects", "project-a.md"),
    ]);
  });

  it("discovers image files recursively", async () => {
    const files = (await VaultIndex.getImageFiles(VAULT)).map((f) => path.relative(VAULT, f)).sort();
    expect(files).toEqual([path.join("images", "pic.png")]);
  });

  it("returns identical arrays for repeated calls (cache hit)", async () => {
    const a = await VaultIndex.getMdFiles(VAULT);
    const b = await VaultIndex.getMdFiles(VAULT);
    expect(b).toBe(a);
  });

  it("invalidates the cache so a rescan occurs", async () => {
    VaultIndex.invalidate(VAULT);
    const files = await VaultIndex.getMdFiles(VAULT);
    expect(files.length).toBe(4);
  });

  it("clear() drops all cached vaults", async () => {
    await VaultIndex.getMdFiles(VAULT);
    VaultIndex.clear();
    const a = await VaultIndex.getMdFiles(VAULT);
    const b = await VaultIndex.getMdFiles(VAULT);
    expect(b).toBe(a);
  });
});