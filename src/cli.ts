#!/usr/bin/env node
import { existsSync } from "node:fs";
import * as clack from "@clack/prompts";
import { Command } from "commander";
import { runEnv } from "./commands/env.js";
import { runInit } from "./commands/init.js";
import { runStatus } from "./commands/status.js";
import { runSync } from "./commands/sync.js";
import { configPath, ConfigNotFoundError } from "./core/config.js";
import { ADAPTERS } from "./integrations/registry.js";

const program = new Command();

program.name("sync-sync-sync").description("複数AIコーディングツールのMCP/指示設定を一元管理するCLI");

interface InitPromptResult {
  enabledToolIds?: string[];
  withOnboarding: boolean;
}

/**
 * Only prompts when it would actually matter: config.json doesn't exist yet, we're attached to
 * a real terminal, and the caller didn't opt out with --yes. Otherwise falls back to leaving
 * enabledToolIds undefined (runInit then enables every registered adapter, unchanged prior
 * behavior) and only honors --with-onboarding if it was passed explicitly.
 */
async function promptInitOptions(
  projectRoot: string,
  opts: { yes: boolean; withOnboarding: boolean },
): Promise<InitPromptResult> {
  const skipPrompt = opts.yes || existsSync(configPath(projectRoot)) || !process.stdin.isTTY;
  if (skipPrompt) {
    return { enabledToolIds: undefined, withOnboarding: opts.withOnboarding };
  }

  clack.intro("sync-sync-sync init");

  const selected = await clack.multiselect({
    message: "どのツール向けに同期しますか？（スペースで選択/解除、Enterで確定）",
    options: ADAPTERS.map((adapter) => ({ value: adapter.id, label: adapter.displayName })),
    initialValues: ADAPTERS.map((adapter) => adapter.id),
    required: false,
  });
  if (clack.isCancel(selected)) {
    clack.cancel("キャンセルしました。");
    process.exit(1);
  }

  const withOnboarding =
    opts.withOnboarding ||
    (await clack.confirm({
      message: "チーム向けのオンボーディング資料（ONBOARDING.md）も生成しますか？",
      initialValue: false,
    }));
  if (clack.isCancel(withOnboarding)) {
    clack.cancel("キャンセルしました。");
    process.exit(1);
  }

  return { enabledToolIds: selected as string[], withOnboarding: withOnboarding as boolean };
}

program
  .command("init")
  .description(".sync-sync-sync/config.json を初期化する")
  .option("--yes", "対話プロンプトをスキップし、全ツールを有効にする", false)
  .option("--with-onboarding", "ONBOARDING.md も生成する（プロンプトをスキップする場合に指定）", false)
  .action(async (opts: { yes: boolean; withOnboarding: boolean }) => {
    const projectRoot = process.cwd();
    const { enabledToolIds, withOnboarding } = await promptInitOptions(projectRoot, opts);
    process.exitCode = runInit(projectRoot, { enabledToolIds, withOnboarding });
  });

program
  .command("sync")
  .description("各ツール固有の設定ファイルを生成する")
  .option("--check", "書き込みせずドリフトのみ検知し、ドリフトがあれば非ゼロ終了する", false)
  .action((opts: { check: boolean }) => {
    try {
      process.exitCode = runSync(process.cwd(), { check: opts.check });
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("status")
  .description("現在の同期状態・ドリフトを表示する")
  .action(() => {
    try {
      process.exitCode = runStatus(process.cwd());
    } catch (error) {
      handleError(error);
    }
  });

program
  .command("env")
  .description(".sync-sync-sync/local.json の秘密情報をexport文として出力する（eval \"$(sync-sync-sync env)\" や .envrc で利用）")
  .action(() => {
    try {
      process.exitCode = runEnv(process.cwd());
    } catch (error) {
      handleError(error);
    }
  });

function handleError(error: unknown): void {
  if (error instanceof ConfigNotFoundError) {
    console.error(error.message);
    process.exitCode = 1;
    return;
  }
  throw error;
}

program.parse();
