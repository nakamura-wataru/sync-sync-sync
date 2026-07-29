import { ResolvedConfig } from "../core/resolve.js";
import { importMcpServersJson, renderMcpServersJson } from "./mcpJson.js";
import { RenderedFile, ToolAdapter } from "./types.js";

const MCP_PATH = ".cursor/mcp.json";
const INSTRUCTIONS_PATH = ".cursor/rules/sync-sync-sync.mdc";

const ENV_REF_PATTERN = /^\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}$/;

function formatEnvRef(varName: string): string {
  return `\${env:${varName}}`;
}

function parseEnvRef(value: string): string | undefined {
  return ENV_REF_PATTERN.exec(value)?.[1];
}

function renderInstructions(instructionsBody: string): string {
  const frontmatter = ["---", 'description: "sync-sync-sync managed instructions"', "globs:", "alwaysApply: true", "---", ""].join(
    "\n",
  );
  return `${frontmatter}\n${instructionsBody}`;
}

export const cursorAdapter: ToolAdapter = {
  id: "cursor",
  displayName: "Cursor",

  formatEnvRef,

  getManagedFiles(): string[] {
    return [MCP_PATH, INSTRUCTIONS_PATH];
  },

  render(resolved: ResolvedConfig): RenderedFile[] {
    return [
      { path: MCP_PATH, contents: renderMcpServersJson(resolved, formatEnvRef) },
      { path: INSTRUCTIONS_PATH, contents: renderInstructions(resolved.instructionsBody) },
    ];
  },

  importExistingMcpServers(projectRoot: string): Record<string, unknown> | undefined {
    return importMcpServersJson(projectRoot, MCP_PATH, parseEnvRef);
  },
};
