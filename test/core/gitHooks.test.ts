import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { installGitHooks } from "../../src/core/gitHooks.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sync-sync-sync-hooks-"));
});

function initGitDir(root: string): void {
  mkdirSync(join(root, ".git"), { recursive: true });
}

describe("installGitHooks", () => {
  it("skips when there is no .git directory or file", () => {
    const messages = installGitHooks(dir);
    expect(messages).toEqual(["gitリポジトリが見つからないため、git hookの設置をスキップしました。"]);
  });

  it("installs post-merge and post-checkout hooks as executable scripts", () => {
    initGitDir(dir);
    const messages = installGitHooks(dir);

    expect(messages).toEqual([
      ".git/hooks/post-merge を設置しました。",
      ".git/hooks/post-checkout を設置しました。",
    ]);

    const postMerge = join(dir, ".git", "hooks", "post-merge");
    expect(existsSync(postMerge)).toBe(true);
    expect(readFileSync(postMerge, "utf8")).toContain("sync-sync-sync:sync-check-hook");
    expect(readFileSync(postMerge, "utf8")).toContain("sync-sync-sync sync --check");
    expect(statSync(postMerge).mode & 0o111).toBeTruthy();
  });

  it("is idempotent: re-running does not duplicate the hook body", () => {
    initGitDir(dir);
    installGitHooks(dir);
    const messages = installGitHooks(dir);

    expect(messages).toEqual([
      ".git/hooks/post-merge は設置済みです。",
      ".git/hooks/post-checkout は設置済みです。",
    ]);
  });

  it("appends to an existing foreign hook instead of overwriting it", () => {
    initGitDir(dir);
    const hooksDir = join(dir, ".git", "hooks");
    mkdirSync(hooksDir, { recursive: true });
    writeFileSync(join(hooksDir, "post-merge"), "#!/bin/sh\necho existing-husky-hook\n", "utf8");

    const messages = installGitHooks(dir);
    expect(messages[0]).toBe(".git/hooks/post-merge に追記しました（既存のhookは保持）。");

    const contents = readFileSync(join(hooksDir, "post-merge"), "utf8");
    expect(contents).toContain("echo existing-husky-hook");
    expect(contents).toContain("sync-sync-sync:sync-check-hook");
  });

  it("resolves the real hooks dir for a worktree-style .git file", () => {
    const realGitDir = mkdtempSync(join(tmpdir(), "sync-sync-sync-real-git-"));
    writeFileSync(join(dir, ".git"), `gitdir: ${realGitDir}\n`, "utf8");

    installGitHooks(dir);

    expect(existsSync(join(realGitDir, "hooks", "post-merge"))).toBe(true);
  });
});
