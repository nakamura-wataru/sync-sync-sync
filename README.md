# sync-sync-sync

複数のAIコーディングツール（Claude Code, Cursor, Codex）が要求するMCPサーバー設定・指示ファイルを、
`.sync-sync-sync/config.json` を単一のソースオブトゥルースとして一元管理するCLI。

## セットアップ

### Homebrew（推奨）

```bash
brew tap nakamura-wataru/sync-sync-sync https://github.com/nakamura-wataru/sync-sync-sync
brew install sync-sync-sync
```

### ソースから

```bash
npm install
npm run build
npm link   # グローバルに `sync-sync-sync` コマンドとして使う
```

## クイックスタート

```bash
sync-sync-sync init          # .sync-sync-sync/ を初期化（既存のMCP設定があれば自動で取り込む）
sync-sync-sync sync          # 各ツール固有の設定ファイルを生成
sync-sync-sync status        # 同期状態を確認
```

`init`は対話式（実際のターミナルなら）で、同期するツールの選択・オンボーディング資料の生成・直後の`sync`実行、を確認できる。非対話環境（CI等）や`--yes`指定時はプロンプトを出さず、全ツール有効・`sync`は未実行がデフォルト（`--with-onboarding` / `--run-sync`で個別に有効化可能）。

## コマンド

| コマンド | 内容 |
|---|---|
| `init` | `.sync-sync-sync/config.json` 等を作成。既存の`.mcp.json`等があれば自動取り込み |
| `sync` | `config.json`から各ツールの設定ファイルを生成（冪等、変化がなければ書き込みしない） |
| `sync --check` | 書き込みせずドリフトのみ検知。ドリフトがあれば非ゼロ終了（CI用） |
| `status` | 同期状態（`in-sync`/`drift`/`missing`）と未設定secretを表示 |
| `env` | `local.json`の秘密情報を`export`文として出力（`eval "$(sync-sync-sync env)"`で反映） |

gitリポジトリ内であれば`init`時に`post-merge`/`post-checkout`のgit hookも自動設置され、`sync --check`忘れを検知する（既存hookがあれば追記、上書きしない）。

## `config.json` の形式

```json
{
  "version": 1,
  "tools": {
    "claude-code": { "enabled": true },
    "cursor": { "enabled": true },
    "codex": { "enabled": true }
  },
  "instructions": {
    "source": "./.sync-sync-sync/instructions.md"
  },
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": { "secret": "GITHUB_TOKEN" },
        "MODE": "prod"
      }
    }
  }
}
```

- `tools.<id>.enabled` — そのツール向けファイルを生成するか
- `instructions.source` — 全ツール共通の指示文（Markdown）へのパス
- `mcpServers.<name>` — `command`/`args` または `url` のいずれかが必須
- `mcpServers.<name>.env` / `headers` の値は、文字列リテラル（例: `"MODE": "prod"`）または `{ "secret": "KEY名" }`（秘密情報への参照）

## 秘密情報の扱い

- `config.json`には実値を書かない。実値は`.sync-sync-sync/local.json`（`.gitignore`対象、開発者ローカル）に置く
- 生成ファイルにも実値は書かれず、ツールごとの環境変数参照構文になる:
  - Claude Code: `"${GITHUB_TOKEN}"` / Cursor: `"${env:GITHUB_TOKEN}"` / Codex: `env_vars = ["GITHUB_TOKEN"]`（キー名と環境変数名が一致する場合のみ。ヘッダーの秘密値は`env_http_headers`でリネーム可）
  - 実行時はプロセスの環境変数を見るだけなので、`eval "$(sync-sync-sync env)"`（または`.envrc`）でシェルに反映させる必要がある
- 未設定のsecretがあれば`sync`/`status`実行時に警告が出る（書き込みは止めない）
- **既知の制約（Codex）**: secretのキー名が実際の環境変数名と異なる場合、`env`側はCodexの出力から省略される（リネーム不可のため）。`bearer_token_env_var`は挙動未確認のため取り込み時にそのまま素通しする（他ツールでは効かない。全ツール共通で使いたい場合は`headers: {"Authorization": {"secret": "KEY名"}}`に書き換える）

## 生成されるファイル

| ツール | MCP設定 | 指示ファイル |
|---|---|---|
| Claude Code | `.mcp.json` | `AGENTS.md`（実体） + `CLAUDE.md`（`@AGENTS.md`の1行インポート） |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/sync-sync-sync.mdc` |
| Codex | `.codex/config.toml` | `AGENTS.md` |

いずれも`config.json`/`instructions.md`から機械的に再生成されるファイルなので手で直接編集しないこと。編集は`.sync-sync-sync/config.json`と`.sync-sync-sync/instructions.md`に対して行い、`sync-sync-sync sync`を実行する。設計の背景は[CONTRIBUTING.md](./CONTRIBUTING.md)を参照。

## Skillsは対象外（同期不要）

`.claude/skills/<name>/SKILL.md`はCursorが`.claude/skills/`を直接読むため、同期不要（2026年7月、Cursor 3.11.25で実機確認済み）。

## CIでのドリフト検知

```yaml
- run: sync-sync-sync sync --check
```

生成ファイルが`config.json`/`instructions.md`と一致しない場合（手編集、`sync`忘れ等）に非ゼロ終了する。

## 開発

コントリビュート方法・アーキテクチャは [CONTRIBUTING.md](./CONTRIBUTING.md) を参照。
