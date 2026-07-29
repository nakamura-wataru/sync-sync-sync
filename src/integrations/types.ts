import { ResolvedConfig } from "../core/resolve.js";

export interface RenderedFile {
  /** Path relative to the project root. */
  path: string;
  contents: string;
}

export interface ToolAdapter {
  id: string;
  displayName: string;

  /**
   * Formats a reference to an environment variable in this tool's own config syntax.
   * Only meaningful for tools whose MCP config embeds a single inline `${VAR}`-style string
   * (Claude Code, Cursor). Tools with structurally different secret-passing (e.g. Codex's
   * separate `env_vars`/`bearer_token_env_var` fields) omit this.
   */
  formatEnvRef?(varName: string): string;

  /** Paths (relative to project root) this adapter writes to, for status/drift reporting. */
  getManagedFiles(resolved: ResolvedConfig): string[];

  /** Pure: same ResolvedConfig always produces the same output. */
  render(resolved: ResolvedConfig): RenderedFile[];

  /**
   * Reads this tool's own pre-existing MCP config file (if any) and converts it into
   * config.json's `mcpServers` shape — env-var references in this tool's own syntax become
   * `{"secret": "NAME"}`, everything else (including unknown fields) passes through as-is.
   * Returns undefined if the file doesn't exist or isn't parseable.
   */
  importExistingMcpServers(projectRoot: string): Record<string, unknown> | undefined;
}
