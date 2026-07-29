import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ResolvedConfig } from "../../src/core/resolve.js";
import { claudeCodeAdapter } from "../../src/integrations/claude-code.js";

const resolved: ResolvedConfig = {
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "server-github"],
      env: {
        GITHUB_TOKEN: { kind: "secret", name: "GITHUB_TOKEN" },
        MODE: { kind: "literal", value: "prod" },
      },
      headers: {},
      extra: {},
    },
    "figma-desktop": {
      args: [],
      env: {},
      headers: {},
      url: "http://127.0.0.1:3845/mcp",
      extra: { type: "http" },
    },
  },
  instructionsBody: "# Shared instructions\n",
  enabledToolIds: ["claude-code"],
  missingSecrets: [],
};

describe("claudeCodeAdapter", () => {
  it("formats env references with ${VAR} syntax", () => {
    expect(claudeCodeAdapter.formatEnvRef("GITHUB_TOKEN")).toBe("${GITHUB_TOKEN}");
  });

  it("renders .mcp.json with resolved secrets as env-var references", () => {
    const files = claudeCodeAdapter.render(resolved);
    const mcp = files.find((f) => f.path === ".mcp.json");
    expect(mcp).toBeDefined();
    const parsed = JSON.parse(mcp!.contents);
    expect(parsed.mcpServers.github.env.GITHUB_TOKEN).toBe("${GITHUB_TOKEN}");
    expect(parsed.mcpServers.github.env.MODE).toBe("prod");
  });

  it("passes through client-specific fields like \"type\" verbatim (regression: must not drop unknown MCP server fields)", () => {
    const files = claudeCodeAdapter.render(resolved);
    const mcp = files.find((f) => f.path === ".mcp.json");
    const parsed = JSON.parse(mcp!.contents);
    expect(parsed.mcpServers["figma-desktop"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3845/mcp",
    });
  });

  it("renders AGENTS.md with the instructions body verbatim, and CLAUDE.md as a thin @AGENTS.md import (no content duplication)", () => {
    const files = claudeCodeAdapter.render(resolved);
    const agentsMd = files.find((f) => f.path === "AGENTS.md");
    const claudeMd = files.find((f) => f.path === "CLAUDE.md");
    expect(agentsMd?.contents).toBe("# Shared instructions\n");
    expect(claudeMd?.contents).toBe("@AGENTS.md\n");
  });

  it("is idempotent: rendering twice produces identical output", () => {
    expect(claudeCodeAdapter.render(resolved)).toEqual(claudeCodeAdapter.render(resolved));
  });

  describe("importExistingMcpServers", () => {
    it("converts ${VAR} env references to secret refs and passes through unknown fields", () => {
      const dir = mkdtempSync(join(tmpdir(), "claude-code-import-"));
      writeFileSync(
        join(dir, ".mcp.json"),
        JSON.stringify({
          mcpServers: {
            "figma-desktop": { type: "http", url: "http://127.0.0.1:3845/mcp" },
            github: { command: "npx", args: ["-y", "x"], env: { TOKEN: "${GITHUB_TOKEN}" } },
          },
        }),
        "utf8",
      );

      const imported = claudeCodeAdapter.importExistingMcpServers(dir);

      expect(imported?.["figma-desktop"]).toEqual({
        type: "http",
        url: "http://127.0.0.1:3845/mcp",
      });
      expect((imported?.github as any).env).toEqual({ TOKEN: { secret: "GITHUB_TOKEN" } });
    });

    it("returns undefined when there is no pre-existing .mcp.json", () => {
      const dir = mkdtempSync(join(tmpdir(), "claude-code-import-"));
      expect(claudeCodeAdapter.importExistingMcpServers(dir)).toBeUndefined();
    });
  });
});
