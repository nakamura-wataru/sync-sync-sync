import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { computeDrift } from "../../src/core/diff.js";
import { ResolvedConfig } from "../../src/core/resolve.js";
import { ToolAdapter } from "../../src/integrations/types.js";

let dir: string;

const resolved: ResolvedConfig = {
  mcpServers: {},
  instructionsBody: "",
  enabledToolIds: ["fake"],
  missingSecrets: [],
};

function fakeAdapter(): ToolAdapter {
  return {
    id: "fake",
    displayName: "Fake",
    formatEnvRef: (name) => `\${${name}}`,
    getManagedFiles: () => ["a.json", "b.json"],
    render: () => [
      { path: "a.json", contents: "same\n" },
      { path: "b.json", contents: "expected\n" },
    ],
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sync-sync-sync-diff-"));
});

describe("computeDrift", () => {
  it("reports missing when the file does not exist", () => {
    const drifts = computeDrift(fakeAdapter(), resolved, dir);
    expect(drifts).toEqual([
      { toolId: "fake", path: "a.json", status: "missing" },
      { toolId: "fake", path: "b.json", status: "missing" },
    ]);
  });

  it("reports in-sync when disk contents match rendered contents", () => {
    writeFileSync(join(dir, "a.json"), "same\n", "utf8");
    writeFileSync(join(dir, "b.json"), "expected\n", "utf8");

    const drifts = computeDrift(fakeAdapter(), resolved, dir);
    expect(drifts.every((d) => d.status === "in-sync")).toBe(true);
  });

  it("reports drift when disk contents differ from rendered contents", () => {
    writeFileSync(join(dir, "a.json"), "same\n", "utf8");
    writeFileSync(join(dir, "b.json"), "stale\n", "utf8");

    const drifts = computeDrift(fakeAdapter(), resolved, dir);
    expect(drifts.find((d) => d.path === "a.json")?.status).toBe("in-sync");
    expect(drifts.find((d) => d.path === "b.json")?.status).toBe("drift");
  });
});
