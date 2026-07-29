import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ResolvedConfig, ResolvedEnvValue, ResolvedServer } from "../core/resolve.js";

function formatEnvMap(
  map: Record<string, ResolvedEnvValue>,
  formatEnvRef: (varName: string) => string,
): Record<string, string> | undefined {
  const keys = Object.keys(map);
  if (keys.length === 0) return undefined;
  const result: Record<string, string> = {};
  for (const key of keys) {
    const value = map[key];
    result[key] = value.kind === "literal" ? value.value : formatEnvRef(value.name);
  }
  return result;
}

function formatServer(server: ResolvedServer, formatEnvRef: (varName: string) => string) {
  const out: Record<string, unknown> = { ...server.extra };
  if (server.command) out.command = server.command;
  if (server.args.length > 0) out.args = server.args;
  const env = formatEnvMap(server.env, formatEnvRef);
  if (env) out.env = env;
  if (server.url) out.url = server.url;
  const headers = formatEnvMap(server.headers, formatEnvRef);
  if (headers) out.headers = headers;
  return out;
}

/** Renders the shared `{ mcpServers: {...} }` shape used by both Claude Code and Cursor. */
export function renderMcpServersJson(
  resolved: ResolvedConfig,
  formatEnvRef: (varName: string) => string,
): string {
  const mcpServers: Record<string, unknown> = {};
  for (const name of Object.keys(resolved.mcpServers)) {
    mcpServers[name] = formatServer(resolved.mcpServers[name], formatEnvRef);
  }
  return `${JSON.stringify({ mcpServers }, null, 2)}\n`;
}

/** Reads a pre-existing `{ mcpServers: {...} }` file (if any) and returns its raw `mcpServers` object. */
function readMcpServersJson(
  projectRoot: string,
  relativePath: string,
): Record<string, unknown> | undefined {
  const absolutePath = join(projectRoot, relativePath);
  if (!existsSync(absolutePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(absolutePath, "utf8"));
    return parsed && typeof parsed.mcpServers === "object" && parsed.mcpServers !== null
      ? parsed.mcpServers
      : undefined;
  } catch {
    return undefined;
  }
}

function importEnvMap(
  raw: unknown,
  parseEnvRef: (value: string) => string | undefined,
): Record<string, unknown> | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") {
      const secretName = parseEnvRef(value);
      result[key] = secretName ? { secret: secretName } : value;
    } else {
      result[key] = value;
    }
  }
  return result;
}

function importServer(raw: unknown, parseEnvRef: (value: string) => string | undefined): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const server = raw as Record<string, unknown>;
  const out: Record<string, unknown> = { ...server };
  const env = importEnvMap(server.env, parseEnvRef);
  if (env) out.env = env;
  const headers = importEnvMap(server.headers, parseEnvRef);
  if (headers) out.headers = headers;
  return out;
}

/**
 * Imports a tool's own MCP config file into config.json's `mcpServers` shape.
 * `parseEnvRef` should return the variable name if a string matches this tool's own
 * env-var reference syntax (e.g. `${VAR}` or `${env:VAR}`), or undefined otherwise.
 */
export function importMcpServersJson(
  projectRoot: string,
  relativePath: string,
  parseEnvRef: (value: string) => string | undefined,
): Record<string, unknown> | undefined {
  const raw = readMcpServersJson(projectRoot, relativePath);
  if (!raw) return undefined;
  const result: Record<string, unknown> = {};
  for (const name of Object.keys(raw)) {
    result[name] = importServer(raw[name], parseEnvRef);
  }
  return result;
}
