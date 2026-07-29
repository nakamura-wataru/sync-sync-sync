import { LoadedConfig } from "./config.js";
import { EnvValue, McpServer } from "./schema.js";

export type ResolvedEnvValue = { kind: "literal"; value: string } | { kind: "secret"; name: string };

const KNOWN_SERVER_KEYS = new Set(["command", "args", "env", "url", "headers"]);

export interface ResolvedServer {
  command?: string;
  args: string[];
  env: Record<string, ResolvedEnvValue>;
  url?: string;
  headers: Record<string, ResolvedEnvValue>;
  /** Fields outside the known shape (e.g. a client-specific "type"), passed through verbatim. */
  extra: Record<string, unknown>;
}

export interface ResolvedConfig {
  mcpServers: Record<string, ResolvedServer>;
  instructionsBody: string;
  enabledToolIds: string[];
  missingSecrets: string[];
}

function resolveEnvValue(value: EnvValue): ResolvedEnvValue {
  if (typeof value === "string") {
    return { kind: "literal", value };
  }
  return { kind: "secret", name: value.secret };
}

function resolveEnvMap(
  map: Record<string, EnvValue> | undefined,
): Record<string, ResolvedEnvValue> {
  const result: Record<string, ResolvedEnvValue> = {};
  for (const key of Object.keys(map ?? {})) {
    result[key] = resolveEnvValue((map as Record<string, EnvValue>)[key]);
  }
  return result;
}

function resolveServer(server: McpServer): ResolvedServer {
  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(server)) {
    if (!KNOWN_SERVER_KEYS.has(key)) {
      extra[key] = (server as Record<string, unknown>)[key];
    }
  }

  return {
    command: server.command,
    args: server.args ?? [],
    env: resolveEnvMap(server.env),
    url: server.url,
    headers: resolveEnvMap(server.headers),
    extra,
  };
}

export function resolveConfig(loaded: LoadedConfig): ResolvedConfig {
  const mcpServers: Record<string, ResolvedServer> = {};
  const referencedSecrets = new Set<string>();

  for (const name of Object.keys(loaded.config.mcpServers)) {
    const resolved = resolveServer(loaded.config.mcpServers[name]);
    mcpServers[name] = resolved;
    for (const envValue of [...Object.values(resolved.env), ...Object.values(resolved.headers)]) {
      if (envValue.kind === "secret") {
        referencedSecrets.add(envValue.name);
      }
    }
  }

  const knownSecrets = new Set(Object.keys(loaded.localSecrets.secrets));
  const missingSecrets = [...referencedSecrets].filter((name) => !knownSecrets.has(name)).sort();

  const enabledToolIds = Object.keys(loaded.config.tools).filter(
    (id) => loaded.config.tools[id].enabled,
  );

  return {
    mcpServers,
    instructionsBody: loaded.instructionsBody,
    enabledToolIds,
    missingSecrets,
  };
}
