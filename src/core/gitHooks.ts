import { chmodSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

const MARKER = "# sync-sync-sync:sync-check-hook";
const HOOK_NAMES = ["post-merge", "post-checkout"] as const;

const HOOK_BODY = `if command -v sync-sync-sync >/dev/null 2>&1; then
  sync-sync-sync sync --check || echo "sync-sync-sync: .sync-sync-sync/config.json と生成ファイルがズレています。'sync-sync-sync sync' を実行してください。"
elif [ -x "./node_modules/.bin/sync-sync-sync" ]; then
  ./node_modules/.bin/sync-sync-sync sync --check || echo "sync-sync-sync: .sync-sync-sync/config.json と生成ファイルがズレています。'sync-sync-sync sync' を実行してください。"
fi
exit 0
`;

function resolveGitDir(projectRoot: string): string | undefined {
  const dotGit = join(projectRoot, ".git");
  if (!existsSync(dotGit)) return undefined;
  if (statSync(dotGit).isDirectory()) return dotGit;

  // Worktrees/submodules: `.git` is a file containing `gitdir: <path>`.
  const match = readFileSync(dotGit, "utf8").trim().match(/^gitdir:\s*(.+)$/);
  if (!match) return undefined;
  return isAbsolute(match[1]) ? match[1] : resolve(projectRoot, match[1]);
}

export function installGitHooks(projectRoot: string): string[] {
  const gitDir = resolveGitDir(projectRoot);
  if (!gitDir) {
    return ["gitリポジトリが見つからないため、git hookの設置をスキップしました。"];
  }

  const hooksDir = join(gitDir, "hooks");
  mkdirSync(hooksDir, { recursive: true });

  return HOOK_NAMES.map((name) => {
    const hookPath = join(hooksDir, name);
    if (existsSync(hookPath)) {
      const existing = readFileSync(hookPath, "utf8");
      if (existing.includes(MARKER)) {
        return `.git/hooks/${name} は設置済みです。`;
      }
      writeFileSync(hookPath, `${existing.trimEnd()}\n\n${MARKER}\n${HOOK_BODY}`, "utf8");
      chmodSync(hookPath, 0o755);
      return `.git/hooks/${name} に追記しました（既存のhookは保持）。`;
    }
    writeFileSync(hookPath, `#!/bin/sh\n${MARKER}\n${HOOK_BODY}`, "utf8");
    chmodSync(hookPath, 0o755);
    return `.git/hooks/${name} を設置しました。`;
  });
}
