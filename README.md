# sync-sync-sync

複数のAIコーディングツール（Claude Code, Cursor, ...）が要求するMCPサーバー設定・指示ファイルを、
`.sync-sync-sync/config.json` を単一のソースオブトゥルースとして一元管理するCLI。

## セットアップ

```bash
npm install
npm run build
```

グローバルに `sync-sync-sync` コマンドとして使う場合:

```bash
npm link
```

以降の例では `node dist/cli.js` の代わりに `sync-sync-sync` と表記する。ローカルでビルドしたものを直接使う場合は
`node dist/cli.js <command>` に読み替える。

## クイックスタート

```bash
sync-sync-sync init          # .sync-sync-sync/ を初期化
# .sync-sync-sync/config.json を編集して mcpServers・指示内容を記述する
sync-sync-sync sync          # 各ツール固有の設定ファイルを生成
sync-sync-sync status        # 同期状態を確認
```

## コマンド

### `sync-sync-sync init`

`.sync-sync-sync/` ディレクトリと以下のファイルを作成する。

- `.sync-sync-sync/config.json` — チームで共有するソースオブトゥルース（コミット対象）
- `.sync-sync-sync/local.json` — 開発者ローカルの秘密情報（`.gitignore` に自動追記され、コミット対象外）
- `.sync-sync-sync/instructions.md` — 全ツール共通の指示文（CLAUDE.md / Cursor rules の元ネタ）

既に `.sync-sync-sync/config.json` が存在する場合はファイル生成をスキップする（上書きしない）。

また、gitリポジトリ内であれば `post-merge` / `post-checkout` の git hookを自動設置する（`.git/hooks/` はクローンごとのローカル状態でありコミット対象外のため、`config.json` 生成をスキップした場合でもhookの設置だけは毎回試みる）。既に他のhook（husky等）が設置済みの場合は上書きせず末尾に追記し、二重インストールは行わない（冪等）。このhookは `sync-sync-sync sync --check` を実行し、ドリフトがあればコンソールに警告を出す（gitの操作自体は止めない）。

### `sync-sync-sync sync`

`config.json` の内容から各ツール固有の設定ファイルを生成・上書きする。

- 内容が変わらないファイルは書き込みをスキップする（実行しても余計な差分やmtime変化を生まない＝冪等）
- 実行結果として `[written]` / `[unchanged]` を各ファイルごとに表示する

```bash
sync-sync-sync sync --check
```

- ファイルを一切書き込まず、生成される内容とディスク上の内容の差分（ドリフト）だけを検知する
- 1件でもドリフトがあれば非ゼロ終了する（CIのゲートとして利用する想定）
- ドリフトが無ければ「すべて同期済みです」と表示して `0` で終了する

### `sync-sync-sync status`

現在の同期状態を人間向けに一覧表示する（書き込みは行わない）。

- 有効なツール一覧
- `config.json` で参照されているが `local.json` に未設定のsecret
- ツール・ファイルごとの `in-sync` / `drift` / `missing` 状態

### `sync-sync-sync env`

`.sync-sync-sync/local.json` の秘密情報を、シェルの `export` 文として標準出力に書き出す。

```bash
eval "$(sync-sync-sync env)"
```

- `direnv` を使う場合は `.envrc` に上記の1行を書けば、ディレクトリに入るたびに自動で環境変数がセットされる
- `sync-sync-sync sync` が生成する `${GITHUB_TOKEN}` / `${env:GITHUB_TOKEN}` という参照は、あくまで**プロセスの環境変数**を見に行くだけで、`local.json` の値を自動で読み込むわけではない。`local.json` に値を書いただけではツールは動かないので、必ずこのコマンド経由でシェルの環境変数として反映させること
- 値はシェルの安全な形に自動でクォートされる（シングルクォートを含む値も正しくエスケープされる）

## `config.json` の形式

```json
{
  "version": 1,
  "tools": {
    "claude-code": { "enabled": true },
    "cursor": { "enabled": true }
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

- `tools.<id>.enabled` — そのツール向けファイルを生成するかどうか
- `instructions.source` — 全ツール共通の指示文（Markdown）へのパス
- `mcpServers.<name>` — MCPサーバー定義。`command`/`args` または `url` のいずれかが必須
- `mcpServers.<name>.env` / `headers` の各値は次のいずれか
  - 文字列リテラル（秘密ではない値。例: `"MODE": "prod"`）
  - `{ "secret": "KEY名" }`（秘密情報への参照。実値は書かない）

## 秘密情報の扱い

- `config.json` には秘密情報の**実値を書かない**。`{"secret": "GITHUB_TOKEN"}` のように参照名だけを書く
- 実値は `.sync-sync-sync/local.json`（`.gitignore` 対象）に開発者ごとに保持する
  ```json
  { "secrets": { "GITHUB_TOKEN": "ghp_xxx" } }
  ```
- 生成される各ツールの設定ファイルにも実値は書き込まれない。代わりにツールごとの環境変数参照構文を書き込む
  - Claude Code (`.mcp.json`): `"GITHUB_TOKEN": "${GITHUB_TOKEN}"`
  - Cursor (`.cursor/mcp.json`): `"GITHUB_TOKEN": "${env:GITHUB_TOKEN}"`
  - Codex (`.codex/config.toml`): `env` の値と同名のsecretキーは `env_vars = ["GITHUB_TOKEN"]`（親シェルの同名環境変数をそのまま子プロセスへフォワード）。`headers` の秘密値は `env_http_headers`（ヘッダー名→環境変数名のマップ、こちらはリネーム可）
  - 実行時に各ツールのプロセスに環境変数 `GITHUB_TOKEN` が渡っている必要がある。`eval "$(sync-sync-sync env)"` または `.envrc` に同コマンドを仕込むことで、`local.json` の値をシェルの環境変数として反映できる（→ `sync-sync-sync env` セクション参照）
- `config.json` で参照されているsecretが `local.json` に未設定の場合、`sync` / `status` 実行時に警告が表示される（書き込み自体は止めない）
- **既知の制約（Codex）**: `env.<KEY>` の秘密値でキー名が実際の環境変数名と異なる場合（例: `"MY_TOKEN": {"secret": "GITHUB_TOKEN"}`）、Codexの`env_vars`は同名フォワードしかできずリネームに対応できないため、そのキーはCodex向けの出力からは省略される（他ツール向けには通常通り出力される）。同様に、Codexの`bearer_token_env_var`は正確な実行時挙動（例: `Bearer `プレフィックスの自動付与有無）がドキュメントで確認できなかったため、取り込み時にheadersへ変換せずそのまま素通しする（＝Codex以外のツールでは効かない）。この場合は手動で `headers: {"Authorization": {"secret": "KEY名"}}` に書き換えると全ツール共通で動く

## 生成されるファイル

| ツール | MCP設定 | 指示ファイル |
|---|---|---|
| Claude Code | `.mcp.json` | `AGENTS.md`（実体）+ `CLAUDE.md`（`@AGENTS.md` の1行インポート） |
| Cursor | `.cursor/mcp.json` | `.cursor/rules/sync-sync-sync.mdc` |
| Codex | `.codex/config.toml` | `AGENTS.md` |

いずれも `config.json` と `instructions.md` から機械的に再生成されるファイルであり、手で直接編集しないこと。
編集はすべて `.sync-sync-sync/config.json` と `.sync-sync-sync/instructions.md` に対して行い、`sync-sync-sync sync` を実行する。

`AGENTS.md` はCodexが主導した公開標準（Linux Foundation管理）で、Cursor・Gemini CLI等20以上のツールも自動で読む。Claude Codeは`AGENTS.md`を直接は読まず`CLAUDE.md`しか読まないが、公式ドキュメント（[code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)）が「`AGENTS.md`と内容を二重管理しないために`CLAUDE.md`から`@AGENTS.md`でインポートする」パターンを推奨しているため、sync-sync-syncもそれに従っている。`CLAUDE.md`はシンボリックリンクではなく実体ファイルとして`@AGENTS.md`という1行だけを書き込む（Windowsではシンボリックリンク作成に管理者権限が必要なため、公式もこちらを推奨している）。

Claude CodeとCodexの両方を有効にしている場合、両アダプタがそれぞれ`AGENTS.md`を書き込もうとするが、中身は同一（`instructions.md`の内容）なので2回目の書き込みは`unchanged`になるだけで実害はない（`status`表示で`AGENTS.md`が両ツールの下に重複して出るのは仕様）。Codexを無効にしていても、Claude Codeが有効なら`AGENTS.md`は生成される。

## Skills（Agent Skills）は対象外（同期不要）

`.claude/skills/<name>/SKILL.md` は sync-sync-sync の管理対象にしていない。理由はMCP設定や指示ファイルと違ってツール間でフォーマットが共通（Agent Skills標準）であり、**Cursorが `.claude/skills/` を後方互換でそのまま読む**ため、コピーやフォーマット変換が不要なため（2026年7月、Cursor 3.11.25で実機確認済み）。`.claude/skills/` に置くだけでClaude CodeとCursorの両方から使える。

## CIでのドリフト検知

```yaml
- run: sync-sync-sync sync --check
```

生成ファイルが `config.json`/`instructions.md` と一致しない場合（誰かが生成ファイルを手で編集した、`sync` を忘れた等）に
非ゼロ終了するため、CIのチェックとして組み込める。

## アーキテクチャ

- `src/core` — 設定の読み込み・正規化・差分判定・原子書き込み・git hook設置（ツール非依存）
- `src/integrations` — ツールごとのアダプタ（`ToolAdapter` インターフェースに準拠、1ファイル1ツール）
- `src/commands` — `init` / `sync` / `status` / `env` の実装
- `src/cli.ts` — commander によるエントリポイント

### 新しいツールを追加する

1. `src/integrations/<tool-id>.ts` に `ToolAdapter`（`formatEnvRef` / `getManagedFiles` / `render`）を実装する
2. `src/integrations/registry.ts` の `ADAPTERS` 配列に追加する
3. `config.json` の `tools.<tool-id>.enabled` で有効化できるようになる

既存の Claude Code / Cursor アダプタを参考にする。

## 開発

```bash
npm run typecheck   # tsc --noEmit
npm test            # vitest run
npm run build        # tsup による dist/ 生成
npm run dev -- <command>  # tsx でビルドせず直接実行
```
