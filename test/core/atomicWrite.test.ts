import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileIdempotent } from "../../src/core/atomicWrite.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sync-sync-sync-atomic-"));
});

afterEach(() => {
  // scratch dirs under the OS tmp dir; no cleanup required for the test run
});

describe("writeFileIdempotent", () => {
  it("creates parent directories and writes the file", () => {
    const target = join(dir, "nested", "file.json");
    const result = writeFileIdempotent(target, "hello\n");
    expect(result).toBe("written");
    expect(readFileSync(target, "utf8")).toBe("hello\n");
  });

  it("is a no-op when contents are unchanged", () => {
    const target = join(dir, "file.json");
    writeFileIdempotent(target, "hello\n");
    const mtimeBefore = statSync(target).mtimeMs;

    const result = writeFileIdempotent(target, "hello\n");

    expect(result).toBe("unchanged");
    expect(statSync(target).mtimeMs).toBe(mtimeBefore);
  });

  it("overwrites when contents differ", () => {
    const target = join(dir, "file.json");
    writeFileIdempotent(target, "v1\n");
    const result = writeFileIdempotent(target, "v2\n");

    expect(result).toBe("written");
    expect(readFileSync(target, "utf8")).toBe("v2\n");
  });
});
