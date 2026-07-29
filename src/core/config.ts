import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Config, ConfigSchema, LocalSecrets, LocalSecretsSchema } from "./schema.js";

export const CONFIG_DIR = ".sync-sync-sync";
export const CONFIG_FILENAME = "config.json";
export const LOCAL_FILENAME = "local.json";

export function configPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR, CONFIG_FILENAME);
}

export function localPath(projectRoot: string): string {
  return join(projectRoot, CONFIG_DIR, LOCAL_FILENAME);
}

export interface LoadedConfig {
  config: Config;
  localSecrets: LocalSecrets;
  instructionsBody: string;
}

export class ConfigNotFoundError extends Error {
  constructor(projectRoot: string) {
    super(
      `${configPath(projectRoot)} が見つかりません。先に \`sync-sync-sync init\` を実行してください。`,
    );
    this.name = "ConfigNotFoundError";
  }
}

export function loadConfig(projectRoot: string): LoadedConfig {
  const cfgPath = configPath(projectRoot);
  if (!existsSync(cfgPath)) {
    throw new ConfigNotFoundError(projectRoot);
  }
  const config = ConfigSchema.parse(JSON.parse(readFileSync(cfgPath, "utf8")));

  const secretsPath = localPath(projectRoot);
  const localSecrets = existsSync(secretsPath)
    ? LocalSecretsSchema.parse(JSON.parse(readFileSync(secretsPath, "utf8")))
    : LocalSecretsSchema.parse({ secrets: {} });

  const instructionsPath = join(projectRoot, config.instructions.source);
  const instructionsBody = existsSync(instructionsPath)
    ? readFileSync(instructionsPath, "utf8")
    : "";

  return { config, localSecrets, instructionsBody };
}
