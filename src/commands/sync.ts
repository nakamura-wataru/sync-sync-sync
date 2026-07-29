import { join } from "node:path";
import { writeFileIdempotent } from "../core/atomicWrite.js";
import { loadConfig } from "../core/config.js";
import { computeDrift } from "../core/diff.js";
import { resolveConfig } from "../core/resolve.js";
import { getAdapter } from "../integrations/registry.js";

function enabledAdapters(enabledToolIds: string[]) {
  return enabledToolIds
    .map((id) => getAdapter(id))
    .filter((adapter): adapter is NonNullable<typeof adapter> => adapter !== undefined);
}

function printMissingSecrets(missingSecrets: string[]): void {
  if (missingSecrets.length === 0) return;
  console.warn("警告: 以下のsecretが .sync-sync-sync/local.json に未設定です:");
  for (const name of missingSecrets) {
    console.warn(`  - ${name}`);
  }
}

export interface SyncOptions {
  check: boolean;
}

export function runSync(projectRoot: string, options: SyncOptions): number {
  const loaded = loadConfig(projectRoot);
  const resolved = resolveConfig(loaded);
  const adapters = enabledAdapters(resolved.enabledToolIds);

  printMissingSecrets(resolved.missingSecrets);

  if (options.check) {
    let hasDrift = false;
    for (const adapter of adapters) {
      const drifts = computeDrift(adapter, resolved, projectRoot);
      for (const drift of drifts) {
        if (drift.status !== "in-sync") {
          hasDrift = true;
        }
        console.log(`[${drift.status}] ${adapter.displayName}: ${drift.path}`);
      }
    }
    if (hasDrift) {
      console.error("ドリフトが検出されました。`sync-sync-sync sync` を実行して同期してください。");
      return 1;
    }
    console.log("すべて同期済みです。");
    return 0;
  }

  const results: string[] = [];
  for (const adapter of adapters) {
    for (const file of adapter.render(resolved)) {
      const absolutePath = join(projectRoot, file.path);
      const result = writeFileIdempotent(absolutePath, file.contents);
      results.push(`[${result}] ${adapter.displayName}: ${file.path}`);
    }
  }
  console.log(results.join("\n"));
  return 0;
}
