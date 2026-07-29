import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ResolvedConfig, ResolvedServer } from "../core/resolve.js";
import { RenderedFile, ToolAdapter } from "./types.js";

const MCP_PATH = ".codex/config.toml";
const INSTRUCTIONS_PATH = "AGENTS.md";

/**
 * Codex doesn't support a single inline `${VAR}`-style env reference like Claude Code/Cursor.
 * Instead it has three separate, structurally distinct mechanisms:
 *   - `env_vars`: array of variable NAMES forwarded from the parent shell under the SAME name
 *     (no renaming). Used for stdio server env vars.
 *   - `env_http_headers`: map of header name -> env var name (renaming supported). Used for
 *     HTTP server header secrets.
 *   - `bearer_token_env_var`: a single dedicated field some configs use for the auth header
 *     instead of env_http_headers. Its exact runtime behavior (e.g. auto "Bearer " prefixing)
 *     isn't confirmed from docs, so on import we deliberately leave it untouched (passthrough)
 *     rather than reinterpret it as a generic header.
 * Source: https://developers.openai.com/codex/mcp (fetched 2026-07-27).
 */
function buildServerTable(server: ResolvedServer): Record<string, unknown> {
  const out: Record<string, unknown> = { ...server.extra };

  if (server.command) out.command = server.command;
  if (server.args.length > 0) out.args = server.args;

  const literalEnv: Record<string, string> = {};
  const envVarNames: string[] = [];
  for (const [key, value] of Object.entries(server.env)) {
    if (value.kind === "literal") {
      literalEnv[key] = value.value;
    } else if (key === value.name) {
      envVarNames.push(value.name);
    }
    // else: secret key renamed from its source var — Codex's env_vars can't forward-and-rename,
    // and env's own values aren't documented to support ${VAR} expansion, so this can't be
    // safely represented. Omitted rather than guessed.
  }
  if (Object.keys(literalEnv).length > 0) {
    out.env = { ...(isRecord(out.env) ? out.env : {}), ...literalEnv };
  }
  if (envVarNames.length > 0) {
    out.env_vars = [...(Array.isArray(out.env_vars) ? out.env_vars : []), ...envVarNames];
  }

  if (server.url) out.url = server.url;

  const literalHeaders: Record<string, string> = {};
  const envHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(server.headers)) {
    if (value.kind === "literal") {
      literalHeaders[key] = value.value;
    } else {
      envHeaders[key] = value.name;
    }
  }
  if (Object.keys(literalHeaders).length > 0) out.http_headers = literalHeaders;
  if (Object.keys(envHeaders).length > 0) out.env_http_headers = envHeaders;

  return out;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderConfigToml(resolved: ResolvedConfig): string {
  const mcp_servers: Record<string, unknown> = {};
  for (const name of Object.keys(resolved.mcpServers)) {
    mcp_servers[name] = buildServerTable(resolved.mcpServers[name]);
  }
  return `${stringifyToml({ mcp_servers })}\n`;
}

function readMcpServersToml(projectRoot: string): Record<string, unknown> | undefined {
  const absolutePath = join(projectRoot, MCP_PATH);
  if (!existsSync(absolutePath)) return undefined;
  try {
    const parsed = parseToml(readFileSync(absolutePath, "utf8"));
    return isRecord(parsed.mcp_servers) ? (parsed.mcp_servers as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function importServer(raw: unknown): unknown {
  if (!isRecord(raw)) return raw;
  const out: Record<string, unknown> = { ...raw };

  if (Array.isArray(raw.env_vars) && raw.env_vars.every((entry) => typeof entry === "string")) {
    const env = isRecord(out.env) ? { ...out.env } : {};
    for (const name of raw.env_vars as string[]) {
      env[name] = { secret: name };
    }
    out.env = env;
    delete out.env_vars;
  }
  // else: non-string env_vars entries (e.g. { source: ... }) are left as passthrough —
  // their exact semantics aren't confirmed, so we don't guess a conversion.

  if (isRecord(raw.http_headers)) {
    const headers = isRecord(out.headers) ? { ...out.headers } : {};
    Object.assign(headers, raw.http_headers);
    out.headers = headers;
    delete out.http_headers;
  }

  if (isRecord(raw.env_http_headers)) {
    const headers = isRecord(out.headers) ? { ...out.headers } : {};
    for (const [headerName, envVarName] of Object.entries(raw.env_http_headers)) {
      if (typeof envVarName === "string") {
        headers[headerName] = { secret: envVarName };
      }
    }
    out.headers = headers;
    delete out.env_http_headers;
  }

  // bearer_token_env_var is intentionally left untouched (see buildServerTable's doc comment).

  return out;
}

export const codexAdapter: ToolAdapter = {
  id: "codex",
  displayName: "Codex",

  getManagedFiles(): string[] {
    return [MCP_PATH, INSTRUCTIONS_PATH];
  },

  render(resolved: ResolvedConfig): RenderedFile[] {
    return [
      { path: MCP_PATH, contents: renderConfigToml(resolved) },
      { path: INSTRUCTIONS_PATH, contents: resolved.instructionsBody },
    ];
  },

  importExistingMcpServers(projectRoot: string): Record<string, unknown> | undefined {
    const raw = readMcpServersToml(projectRoot);
    if (!raw) return undefined;
    const result: Record<string, unknown> = {};
    for (const name of Object.keys(raw)) {
      result[name] = importServer(raw[name]);
    }
    return result;
  },
};
