import { ResolvedConfig } from "../core/resolve.js";
import { importMcpServersJson, renderMcpServersJson } from "./mcpJson.js";
import { RenderedFile, ToolAdapter } from "./types.js";

const MCP_PATH = ".mcp.json";
const INSTRUCTIONS_PATH = "CLAUDE.md";
const AGENTS_PATH = "AGENTS.md";

const ENV_REF_PATTERN = /^\$\{([A-Za-z_][A-Za-z0-9_]*)\}$/;

function formatEnvRef(varName: string): string {
  return `\${${varName}}`;
}

function parseEnvRef(value: string): string | undefined {
  return ENV_REF_PATTERN.exec(value)?.[1];
}

export const claudeCodeAdapter: ToolAdapter = {
  id: "claude-code",
  displayName: "Claude Code",

  formatEnvRef,

  getManagedFiles(): string[] {
    return [MCP_PATH, INSTRUCTIONS_PATH, AGENTS_PATH];
  },

  render(resolved: ResolvedConfig): RenderedFile[] {
    return [
      { path: MCP_PATH, contents: renderMcpServersJson(resolved, formatEnvRef) },
      // AGENTS.md is the shared instructions file (also written by the Codex adapter when
      // enabled). CLAUDE.md just imports it via Claude Code's own `@path` syntax rather than
      // duplicating the content, per https://code.claude.com/docs/en/memory (fetched 2026-07-28).
      { path: AGENTS_PATH, contents: resolved.instructionsBody },
      { path: INSTRUCTIONS_PATH, contents: "@AGENTS.md\n" },
    ];
  },

  importExistingMcpServers(projectRoot: string): Record<string, unknown> | undefined {
    return importMcpServersJson(projectRoot, MCP_PATH, parseEnvRef);
  },
};
