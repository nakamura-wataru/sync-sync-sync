import { describe, expect, it } from "vitest";
import { ConfigSchema, LocalSecretsSchema } from "../../src/core/schema.js";

describe("ConfigSchema", () => {
  it("accepts a minimal valid config", () => {
    const parsed = ConfigSchema.parse({
      version: 1,
      tools: { "claude-code": { enabled: true } },
      instructions: { source: "./.sync-sync-sync/instructions.md" },
      mcpServers: {
        github: {
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-github"],
          env: { GITHUB_TOKEN: { secret: "GITHUB_TOKEN" } },
        },
      },
    });
    expect(parsed.mcpServers.github.command).toBe("npx");
  });

  it("defaults mcpServers to an empty object when omitted", () => {
    const parsed = ConfigSchema.parse({
      version: 1,
      tools: {},
      instructions: { source: "./.sync-sync-sync/instructions.md" },
    });
    expect(parsed.mcpServers).toEqual({});
  });

  it("rejects an mcpServers entry with neither command nor url", () => {
    expect(() =>
      ConfigSchema.parse({
        version: 1,
        tools: {},
        instructions: { source: "./.sync-sync-sync/instructions.md" },
        mcpServers: { broken: {} },
      }),
    ).toThrow();
  });

  it("accepts a url-based mcpServers entry without a command", () => {
    const parsed = ConfigSchema.parse({
      version: 1,
      tools: {},
      instructions: { source: "./.sync-sync-sync/instructions.md" },
      mcpServers: { remote: { url: "https://example.com/mcp" } },
    });
    expect(parsed.mcpServers.remote.url).toBe("https://example.com/mcp");
  });

  it("does not strip client-specific fields it doesn't recognize (e.g. Claude Code's \"type\")", () => {
    const parsed = ConfigSchema.parse({
      version: 1,
      tools: {},
      instructions: { source: "./.sync-sync-sync/instructions.md" },
      mcpServers: { "figma-desktop": { type: "http", url: "http://127.0.0.1:3845/mcp" } },
    });
    expect(parsed.mcpServers["figma-desktop"]).toMatchObject({ type: "http" });
  });
});

describe("LocalSecretsSchema", () => {
  it("defaults secrets to an empty object", () => {
    expect(LocalSecretsSchema.parse({})).toEqual({ secrets: {} });
  });
});
