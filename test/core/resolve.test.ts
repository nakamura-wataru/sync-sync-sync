import { describe, expect, it } from "vitest";
import { LoadedConfig } from "../../src/core/config.js";
import { resolveConfig } from "../../src/core/resolve.js";

function loaded(overrides: Partial<LoadedConfig> = {}): LoadedConfig {
  return {
    config: {
      version: 1,
      tools: { "claude-code": { enabled: true }, cursor: { enabled: false } },
      instructions: { source: "./.sync-sync-sync/instructions.md" },
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "server-github"],
          env: { GITHUB_TOKEN: { secret: "GITHUB_TOKEN" }, MODE: "prod" },
        },
      },
    },
    localSecrets: { secrets: {} },
    instructionsBody: "# hello\n",
    ...overrides,
  };
}

describe("resolveConfig", () => {
  it("only includes enabled tool ids", () => {
    const resolved = resolveConfig(loaded());
    expect(resolved.enabledToolIds).toEqual(["claude-code"]);
  });

  it("normalizes literal and secret env values", () => {
    const resolved = resolveConfig(loaded());
    expect(resolved.mcpServers.github.env.MODE).toEqual({ kind: "literal", value: "prod" });
    expect(resolved.mcpServers.github.env.GITHUB_TOKEN).toEqual({
      kind: "secret",
      name: "GITHUB_TOKEN",
    });
  });

  it("reports secrets referenced in config.json but absent from local.json", () => {
    const resolved = resolveConfig(loaded());
    expect(resolved.missingSecrets).toEqual(["GITHUB_TOKEN"]);
  });

  it("does not report secrets that are present in local.json", () => {
    const resolved = resolveConfig(
      loaded({ localSecrets: { secrets: { GITHUB_TOKEN: "ghp_x" } } }),
    );
    expect(resolved.missingSecrets).toEqual([]);
  });

  it("carries the instructions body through unchanged", () => {
    const resolved = resolveConfig(loaded());
    expect(resolved.instructionsBody).toBe("# hello\n");
  });

  it("passes through client-specific fields it doesn't recognize (e.g. \"type\")", () => {
    const resolved = resolveConfig(
      loaded({
        config: {
          version: 1,
          tools: {},
          instructions: { source: "./.sync-sync-sync/instructions.md" },
          mcpServers: {
            "figma-desktop": { type: "http", url: "http://127.0.0.1:3845/mcp" },
          },
        },
      }),
    );
    expect(resolved.mcpServers["figma-desktop"].extra).toEqual({ type: "http" });
  });
});
