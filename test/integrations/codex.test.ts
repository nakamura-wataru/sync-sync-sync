import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse as parseToml, stringify as stringifyToml } from "smol-toml";
import { ResolvedConfig } from "../../src/core/resolve.js";
import { codexAdapter } from "../../src/integrations/codex.js";

const resolved: ResolvedConfig = {
  mcpServers: {
    "playwright-mcp": {
      command: "npx",
      args: ["@playwright/mcp@latest"],
      env: {},
      headers: {},
      extra: {},
    },
    github: {
      command: "npx",
      args: ["-y", "server-github"],
      env: {
        GITHUB_TOKEN: { kind: "secret", name: "GITHUB_TOKEN" },
        MODE: { kind: "literal", value: "prod" },
      },
      headers: {},
      extra: {},
    },
    figma: {
      args: [],
      env: {},
      url: "https://mcp.figma.com/mcp",
      headers: {
        Authorization: { kind: "secret", name: "FIGMA_OAUTH_TOKEN" },
        "X-Static": { kind: "literal", value: "abc" },
      },
      extra: {},
    },
  },
  instructionsBody: "# Shared instructions\n",
  enabledToolIds: ["codex"],
  missingSecrets: [],
};

describe("codexAdapter", () => {
  it("has no formatEnvRef — Codex has no single inline env-ref syntax", () => {
    expect(codexAdapter.formatEnvRef).toBeUndefined();
  });

  it("renders .codex/config.toml with literal env values and same-name secrets as env_vars", () => {
    const files = codexAdapter.render(resolved);
    const tomlFile = files.find((f) => f.path === ".codex/config.toml");
    expect(tomlFile).toBeDefined();
    const parsed = parseToml(tomlFile!.contents) as any;

    expect(parsed.mcp_servers.github.env).toEqual({ MODE: "prod" });
    expect(parsed.mcp_servers.github.env_vars).toEqual(["GITHUB_TOKEN"]);
  });

  it("renders HTTP servers with literal headers in http_headers and secret headers in env_http_headers (renaming supported)", () => {
    const files = codexAdapter.render(resolved);
    const tomlFile = files.find((f) => f.path === ".codex/config.toml");
    const parsed = parseToml(tomlFile!.contents) as any;

    expect(parsed.mcp_servers.figma.url).toBe("https://mcp.figma.com/mcp");
    expect(parsed.mcp_servers.figma.http_headers).toEqual({ "X-Static": "abc" });
    expect(parsed.mcp_servers.figma.env_http_headers).toEqual({ Authorization: "FIGMA_OAUTH_TOKEN" });
  });

  it("renders AGENTS.md with the instructions body verbatim", () => {
    const files = codexAdapter.render(resolved);
    const agentsMd = files.find((f) => f.path === "AGENTS.md");
    expect(agentsMd?.contents).toBe("# Shared instructions\n");
  });

  it("omits an env secret whose key differs from the source var name (no safe rename mechanism for Codex env)", () => {
    const withRenamedSecret: ResolvedConfig = {
      ...resolved,
      mcpServers: {
        weird: {
          command: "npx",
          args: [],
          env: { MY_KEY: { kind: "secret", name: "ACTUAL_VAR_NAME" } },
          headers: {},
          extra: {},
        },
      },
    };
    const files = codexAdapter.render(withRenamedSecret);
    const parsed = parseToml(files.find((f) => f.path === ".codex/config.toml")!.contents) as any;
    expect(parsed.mcp_servers.weird.env).toBeUndefined();
    expect(parsed.mcp_servers.weird.env_vars).toBeUndefined();
  });

  it("is idempotent: rendering twice produces identical output", () => {
    expect(codexAdapter.render(resolved)).toEqual(codexAdapter.render(resolved));
  });

  describe("importExistingMcpServers", () => {
    it("converts env_vars to secret refs, http_headers to literal headers, and env_http_headers to secret header refs", () => {
      const dir = mkdtempSync(join(tmpdir(), "codex-import-"));
      mkdirSync(join(dir, ".codex"), { recursive: true });
      writeFileSync(
        join(dir, ".codex", "config.toml"),
        stringifyToml({
          mcp_servers: {
            github: {
              command: "npx",
              args: ["-y", "x"],
              env: { MODE: "prod" },
              env_vars: ["GITHUB_TOKEN"],
            },
            figma: {
              url: "https://mcp.figma.com/mcp",
              http_headers: { "X-Static": "abc" },
              env_http_headers: { Authorization: "FIGMA_OAUTH_TOKEN" },
            },
          },
        }),
        "utf8",
      );

      const imported = codexAdapter.importExistingMcpServers(dir);

      expect((imported?.github as any).env).toEqual({
        MODE: "prod",
        GITHUB_TOKEN: { secret: "GITHUB_TOKEN" },
      });
      expect((imported?.github as any).env_vars).toBeUndefined();
      expect((imported?.figma as any).headers).toEqual({
        "X-Static": "abc",
        Authorization: { secret: "FIGMA_OAUTH_TOKEN" },
      });
      expect((imported?.figma as any).http_headers).toBeUndefined();
      expect((imported?.figma as any).env_http_headers).toBeUndefined();
    });

    it("leaves bearer_token_env_var untouched as passthrough (semantics not confirmed, so no reinterpretation)", () => {
      const dir = mkdtempSync(join(tmpdir(), "codex-import-"));
      mkdirSync(join(dir, ".codex"), { recursive: true });
      writeFileSync(
        join(dir, ".codex", "config.toml"),
        stringifyToml({
          mcp_servers: { figma: { url: "https://mcp.figma.com/mcp", bearer_token_env_var: "FIGMA_OAUTH_TOKEN" } },
        }),
        "utf8",
      );

      const imported = codexAdapter.importExistingMcpServers(dir);

      expect((imported?.figma as any).bearer_token_env_var).toBe("FIGMA_OAUTH_TOKEN");
    });

    it("returns undefined when there is no pre-existing .codex/config.toml", () => {
      const dir = mkdtempSync(join(tmpdir(), "codex-import-"));
      expect(codexAdapter.importExistingMcpServers(dir)).toBeUndefined();
    });
  });
});
