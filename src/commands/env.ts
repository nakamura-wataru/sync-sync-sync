import { loadConfig } from "../core/config.js";

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function runEnv(projectRoot: string): number {
  const { localSecrets } = loadConfig(projectRoot);
  for (const key of Object.keys(localSecrets.secrets).sort()) {
    console.log(`export ${key}=${shellQuote(localSecrets.secrets[key])}`);
  }
  return 0;
}
