# 開発者向けガイド

## アーキテクチャ

- `src/core` — 設定の読み込み・正規化・差分判定・原子書き込み・git hook設置（ツール非依存）
- `src/integrations` — ツールごとのアダプタ（`ToolAdapter` インターフェースに準拠、1ファイル1ツール）
- `src/commands` — `init` / `sync` / `status` / `env` の実装
- `src/cli.ts` — commander によるエントリポイント

## 新しいツールを追加する

1. `src/integrations/<tool-id>.ts` に `ToolAdapter`（`formatEnvRef` / `getManagedFiles` / `render` / `importExistingMcpServers`）を実装する
2. `src/integrations/registry.ts` の `ADAPTERS` 配列に追加する
3. `config.json` の `tools.<tool-id>.enabled` で有効化できるようになる

既存の Claude Code / Cursor / Codex アダプタを参考にする。

## 開発コマンド

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build        # tsup による dist/ 生成
npm run dev -- <command>  # tsx でビルドせず直接実行
```

## 設計上の判断（背景）

- **`init`と`sync`を分けている理由**: `init`は既存のMCP設定を自動で`config.json`に変換するが、その変換が常に完璧とは限らない。変換結果を確認してから`sync`で実ファイルを上書きできるよう、意図的に1クッション挟んでいる（対話モードでは最後に「今すぐsyncするか」を確認できる）。
- **`CLAUDE.md`が`@AGENTS.md`のインポートになっている理由**: `AGENTS.md`はCodex主導の公開標準で、Cursor・Gemini CLI等も直接読む。Claude Codeは`AGENTS.md`を直接読まないが、公式ドキュメント（[code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)）が二重管理を避けるために`@AGENTS.md`インポートを推奨しているため、それに従っている。実体ファイルを使うのは、Windowsではシンボリックリンク作成に管理者権限が必要なため。
- **Claude CodeとCodexを両方有効にしている場合**、両アダプタがそれぞれ`AGENTS.md`を書こうとするが中身は同一なので実害はない（2回目の書き込みは`unchanged`）。
- **Skillsを同期対象にしていない理由**: `.claude/skills/`はAgent Skills標準としてツール間でフォーマットが共通で、Cursorが後方互換でそのまま読むため、コピーやフォーマット変換が不要（2026年7月、Cursor 3.11.25で実機確認済み）。
