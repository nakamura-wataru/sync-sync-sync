import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configPath, localPath, CONFIG_DIR } from "../core/config.js";
import { installGitHooks } from "../core/gitHooks.js";
import { ResolvedConfig } from "../core/resolve.js";
import { McpServerSchema } from "../core/schema.js";
import { ADAPTERS } from "../integrations/registry.js";

const EMPTY_RESOLVED: ResolvedConfig = {
  mcpServers: {},
  instructionsBody: "",
  enabledToolIds: [],
  missingSecrets: [],
};

function buildOnboardingDoc(enabledToolIds: string[]): string {
  const enabledAdapters = ADAPTERS.filter((adapter) => enabledToolIds.includes(adapter.id));
  const lines = [
    "# AIコーディングツール設定について",
    "",
    "このプロジェクトでは `sync-sync-sync` でMCPサーバー設定・指示ファイルを一元管理しています。",
    "",
    "## セットアップ",
    "",
    "1. `sync-sync-sync` をインストールする（社内の配布方法に従ってください）",
    "2. `.sync-sync-sync/local.json` に必要な秘密情報（APIキー等）を設定する",
    '3. `eval "$(sync-sync-sync env)"` を実行してシェルに反映する',
    "4. 使っているツールを再起動する",
    "",
    "## 同期しているもの",
    "",
    ...enabledAdapters.map(
      (adapter) => `- ${adapter.displayName}: ${adapter.getManagedFiles(EMPTY_RESOLVED).join(" / ")}`,
    ),
    "",
    "## 同期していないもの",
    "",
    "- Skills（`.claude/skills/` に置けばCursorも直接読むため、同期不要）",
    "- 権限設定・hooks（ツールごとに仕組みが違うため統一していない）",
    "",
    "## 設定を変更したいとき",
    "",
    "`.sync-sync-sync/config.json` / `.sync-sync-sync/instructions.md` を編集し、`sync-sync-sync sync` を実行してください。",
  ];
  return `${lines.join("\n")}\n`;
}

const LOCAL_TEMPLATE = `${JSON.stringify({ secrets: {} }, null, 2)}\n`;

interface ImportResult {
  mcpServers: Record<string, unknown>;
  messages: string[];
}

/**
 * Scans each adapter's own pre-existing MCP config file (e.g. a hand-authored .mcp.json) so a
 * fresh `init` doesn't start from an empty mcpServers — the next `sync` would otherwise silently
 * overwrite and wipe out whatever was already there.
 */
function importExistingMcpServers(projectRoot: string): ImportResult {
  const mcpServers: Record<string, unknown> = {};
  const sourceOf: Record<string, string> = {};
  const messages: string[] = [];

  for (const adapter of ADAPTERS) {
    const imported = adapter.importExistingMcpServers(projectRoot);
    if (!imported) continue;

    const importedNames: string[] = [];
    for (const name of Object.keys(imported)) {
      const validation = McpServerSchema.safeParse(imported[name]);
      if (!validation.success) {
        messages.push(
          `警告: ${adapter.displayName} の "${name}" は取り込めない形式だったためスキップしました。手動で .sync-sync-sync/config.json に追記してください。`,
        );
        continue;
      }

      if (name in mcpServers) {
        if (JSON.stringify(mcpServers[name]) !== JSON.stringify(validation.data)) {
          messages.push(
            `警告: "${name}" は ${sourceOf[name]} と ${adapter.displayName} の両方に異なる内容で存在します。${sourceOf[name]} 側の内容を採用したので、.sync-sync-sync/config.json を確認してください。`,
          );
        }
        continue;
      }

      mcpServers[name] = validation.data;
      sourceOf[name] = adapter.displayName;
      importedNames.push(name);
    }

    if (importedNames.length > 0) {
      messages.push(
        `${adapter.displayName} の既存設定から ${importedNames.length} 件のMCPサーバーを取り込みました: ${importedNames.join(", ")}`,
      );
    }
  }

  return { mcpServers, messages };
}

function buildConfigTemplate(mcpServers: Record<string, unknown>, enabledToolIds: string[]): string {
  const enabledSet = new Set(enabledToolIds);
  const tools: Record<string, { enabled: boolean }> = {};
  for (const adapter of ADAPTERS) {
    tools[adapter.id] = { enabled: enabledSet.has(adapter.id) };
  }

  return `${JSON.stringify(
    {
      version: 1,
      tools,
      instructions: {
        source: "./.sync-sync-sync/instructions.md",
      },
      mcpServers,
    },
    null,
    2,
  )}\n`;
}

const INSTRUCTIONS_TEMPLATE = "# Project Instructions\n\nShared instructions for all AI coding tools. Edit this file, then run `sync-sync-sync sync`.\n";

const GITIGNORE_ENTRY = `${CONFIG_DIR}/local.json`;

function ensureGitignoreEntry(projectRoot: string): void {
  const gitignorePath = join(projectRoot, ".gitignore");
  const existing = existsSync(gitignorePath) ? readFileSync(gitignorePath, "utf8") : "";
  const lines = existing.split("\n").map((line) => line.trim());
  if (lines.includes(GITIGNORE_ENTRY)) return;

  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  writeFileSync(gitignorePath, `${existing}${separator}${GITIGNORE_ENTRY}\n`, "utf8");
}

export interface InitOptions {
  /** Which adapter ids to mark `enabled: true` in the fresh config.json. Defaults to all of them. */
  enabledToolIds?: string[];
  /** Also write a team-facing ONBOARDING.md summarizing scope and setup steps. Default: false. */
  withOnboarding?: boolean;
}

export function runInit(projectRoot: string, options: InitOptions = {}): number {
  const cfgPath = configPath(projectRoot);
  const alreadyInitialized = existsSync(cfgPath);

  if (alreadyInitialized) {
    console.log(`${cfgPath} は既に存在します。上書きしません。`);
  } else {
    const enabledToolIds = options.enabledToolIds ?? ADAPTERS.map((adapter) => adapter.id);
    const { mcpServers, messages: importMessages } = importExistingMcpServers(projectRoot);

    mkdirSync(join(projectRoot, CONFIG_DIR), { recursive: true });
    writeFileSync(cfgPath, buildConfigTemplate(mcpServers, enabledToolIds), "utf8");
    writeFileSync(localPath(projectRoot), LOCAL_TEMPLATE, "utf8");
    writeFileSync(join(projectRoot, CONFIG_DIR, "instructions.md"), INSTRUCTIONS_TEMPLATE, "utf8");
    ensureGitignoreEntry(projectRoot);

    console.log(`${CONFIG_DIR}/ を初期化しました:`);
    console.log(`  - ${CONFIG_DIR}/config.json`);
    console.log(`  - ${CONFIG_DIR}/local.json (gitignore対象)`);
    console.log(`  - ${CONFIG_DIR}/instructions.md`);
    if (options.withOnboarding) {
      writeFileSync(join(projectRoot, "ONBOARDING.md"), buildOnboardingDoc(enabledToolIds), "utf8");
      console.log("  - ONBOARDING.md");
    }
    for (const message of importMessages) {
      console.log(message);
    }
    if (Object.keys(mcpServers).length > 0) {
      console.log(
        "取り込んだ内容を .sync-sync-sync/config.json で確認し、必要なら秘密情報を {\"secret\": \"KEY\"} 参照に調整してから",
      );
    }
    console.log("`sync-sync-sync sync` を実行して各ツールの設定ファイルを生成してください。");
  }

  // .git/hooks はクローンごとのローカル状態でありcommit対象外のため、
  // config.jsonが既に存在する（＝チームメンバーが後から参加した）場合でも毎回インストールを試みる。
  for (const message of installGitHooks(projectRoot)) {
    console.log(message);
  }

  return 0;
}
