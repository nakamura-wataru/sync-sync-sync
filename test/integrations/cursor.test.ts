import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ResolvedConfig } from "../../src/core/resolve.js";
import { cursorAdapter } from "../../src/integrations/cursor.js";

const resolved: ResolvedConfig = {
  mcpServers: {
    github: {
      command: "npx",
      args: ["-y", "server-github"],
      env: { GITHUB_TOKEN: { kind: "secret", name: "GITHUB_TOKEN" } },
      headers: {},
      extra: {},
    },
  },
  instructionsBody: "# Shared instructions\n",
  enabledToolIds: ["cursor"],
  missingSecrets: [],
};

describe("cursorAdapter", () => {
  it("formats env references with ${env:VAR} syntax, distinct from Claude Code", () => {
    expect(cursorAdapter.formatEnvRef("GITHUB_TOKEN")).toBe("${env:GITHUB_TOKEN}");
  });

  it("renders .cursor/mcp.json using the ${env:VAR} reference", () => {
    const files = cursorAdapter.render(resolved);
    const mcp = files.find((f) => f.path === ".cursor/mcp.json");
    const parsed = JSON.parse(mcp!.contents);
    expect(parsed.mcpServers.github.env.GITHUB_TOKEN).toBe("${env:GITHUB_TOKEN}");
  });

  it("renders .cursor/rules/sync-sync-sync.mdc with frontmatter and the instructions body", () => {
    const files = cursorAdapter.render(resolved);
    const rule = files.find((f) => f.path === ".cursor/rules/sync-sync-sync.mdc");
    expect(rule?.contents).toContain("alwaysApply: true");
    expect(rule?.contents).toContain("# Shared instructions");
  });

  describe("importExistingMcpServers", () => {
    it("converts ${env:VAR} references to secret refs, distinct from Claude Code's syntax", () => {
      const dir = mkdtempSync(join(tmpdir(), "cursor-import-"));
      mkdirSync(join(dir, ".cursor"), { recursive: true });
      writeFileSync(
        join(dir, ".cursor", "mcp.json"),
        JSON.stringify({
          mcpServers: {
            github: { command: "npx", args: ["-y", "x"], env: { TOKEN: "${env:GITHUB_TOKEN}" } },
          },
        }),
        "utf8",
      );

      const imported = cursorAdapter.importExistingMcpServers(dir);

      expect((imported?.github as any).env).toEqual({ TOKEN: { secret: "GITHUB_TOKEN" } });
    });

    it("does not mistake Claude Code's ${VAR} syntax for its own ${env:VAR} syntax", () => {
      const dir = mkdtempSync(join(tmpdir(), "cursor-import-"));
      mkdirSync(join(dir, ".cursor"), { recursive: true });
      writeFileSync(
        join(dir, ".cursor", "mcp.json"),
        JSON.stringify({
          mcpServers: { github: { command: "npx", env: { TOKEN: "${GITHUB_TOKEN}" } } },
        }),
        "utf8",
      );

      const imported = cursorAdapter.importExistingMcpServers(dir);

      expect((imported?.github as any).env).toEqual({ TOKEN: "${GITHUB_TOKEN}" });
    });

    it("returns undefined when there is no pre-existing .cursor/mcp.json", () => {
      const dir = mkdtempSync(join(tmpdir(), "cursor-import-"));
      expect(cursorAdapter.importExistingMcpServers(dir)).toBeUndefined();
    });
  });
});
