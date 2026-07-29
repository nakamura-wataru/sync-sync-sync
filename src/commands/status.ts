import { loadConfig } from "../core/config.js";
import { computeDrift } from "../core/diff.js";
import { resolveConfig } from "../core/resolve.js";
import { getAdapter } from "../integrations/registry.js";

export function runStatus(projectRoot: string): number {
  const loaded = loadConfig(projectRoot);
  const resolved = resolveConfig(loaded);

  console.log(`有効なツール: ${resolved.enabledToolIds.join(", ") || "(なし)"}`);

  if (resolved.missingSecrets.length > 0) {
    console.log("未設定のsecret (.sync-sync-sync/local.json):");
    for (const name of resolved.missingSecrets) {
      console.log(`  - ${name}`);
    }
  }

  for (const id of resolved.enabledToolIds) {
    const adapter = getAdapter(id);
    if (!adapter) continue;
    console.log(`\n${adapter.displayName}:`);
    for (const drift of computeDrift(adapter, resolved, projectRoot)) {
      console.log(`  [${drift.status}] ${drift.path}`);
    }
  }

  return 0;
}
