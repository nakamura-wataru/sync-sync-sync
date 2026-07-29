import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runEnv } from "../../src/commands/env.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sync-sync-sync-env-"));
  mkdirSync(join(dir, ".sync-sync-sync"), { recursive: true });
  writeFileSync(
    join(dir, ".sync-sync-sync", "config.json"),
    JSON.stringify({
      version: 1,
      tools: {},
      instructions: { source: "./.sync-sync-sync/instructions.md" },
      mcpServers: {},
    }),
    "utf8",
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runEnv", () => {
  it("prints each local secret as a shell export statement, sorted by key", () => {
    writeFileSync(
      join(dir, ".sync-sync-sync", "local.json"),
      JSON.stringify({ secrets: { GITHUB_TOKEN: "ghp_x", API_KEY: "a b" } }),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const exitCode = runEnv(dir);

    expect(exitCode).toBe(0);
    expect(logSpy.mock.calls.map((call) => call[0])).toEqual([
      "export API_KEY='a b'",
      "export GITHUB_TOKEN='ghp_x'",
    ]);
  });

  it("escapes embedded single quotes safely", () => {
    writeFileSync(
      join(dir, ".sync-sync-sync", "local.json"),
      JSON.stringify({ secrets: { TOKEN: "it's-a-secret" } }),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runEnv(dir);

    expect(logSpy).toHaveBeenCalledWith("export TOKEN='it'\\''s-a-secret'");
  });

  it("prints nothing when local.json has no secrets", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    runEnv(dir);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
