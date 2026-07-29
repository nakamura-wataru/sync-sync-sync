import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runInit } from "../../src/commands/init.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "sync-sync-sync-init-"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function readConfig(): any {
  return JSON.parse(readFileSync(join(dir, ".sync-sync-sync", "config.json"), "utf8"));
}

describe("runInit — importing a pre-existing .mcp.json (regression: must never wipe hand-authored MCP servers)", () => {
  it("imports command-based and http-type servers, converting env-var refs to secret references", () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({
        mcpServers: {
          "playwright-mcp": { command: "npx", args: ["@playwright/mcp@latest"] },
          "figma-desktop": { type: "http", url: "http://127.0.0.1:3845/mcp" },
          github: {
            command: "npx",
            args: ["-y", "server-github"],
            env: { GITHUB_TOKEN: "${GITHUB_TOKEN}", MODE: "prod" },
          },
        },
      }),
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    runInit(dir);

    const config = readConfig();
    expect(config.mcpServers["playwright-mcp"]).toEqual({
      command: "npx",
      args: ["@playwright/mcp@latest"],
    });
    expect(config.mcpServers["figma-desktop"]).toEqual({
      type: "http",
      url: "http://127.0.0.1:3845/mcp",
    });
    expect(config.mcpServers.github.env).toEqual({
      GITHUB_TOKEN: { secret: "GITHUB_TOKEN" },
      MODE: "prod",
    });
  });

  it("prints which servers were imported and from which tool", () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "playwright-mcp": { command: "npx", args: ["x"] } } }),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runInit(dir);

    const logged = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(logged).toContain("Claude Code");
    expect(logged).toContain("playwright-mcp");
  });

  it("merges in servers found only in Cursor's own mcp.json", () => {
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    writeFileSync(
      join(dir, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { "cursor-only": { command: "npx", args: ["cursor-thing"] } } }),
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});

    runInit(dir);

    const config = readConfig();
    expect(config.mcpServers["cursor-only"]).toEqual({ command: "npx", args: ["cursor-thing"] });
  });

  it("warns and keeps the first source's content when the same server name conflicts across tools", () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { shared: { command: "npx", args: ["from-claude"] } } }),
      "utf8",
    );
    mkdirSync(join(dir, ".cursor"), { recursive: true });
    writeFileSync(
      join(dir, ".cursor", "mcp.json"),
      JSON.stringify({ mcpServers: { shared: { command: "npx", args: ["from-cursor"] } } }),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    runInit(dir);

    const config = readConfig();
    expect(config.mcpServers.shared).toEqual({ command: "npx", args: ["from-claude"] });
    const logged = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(logged).toContain("両方に異なる内容で存在します");
  });

  it("skips an entry that fails validation (neither command nor url) with a warning, instead of crashing", () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { broken: { env: { X: "y" } } } }),
      "utf8",
    );
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    expect(() => runInit(dir)).not.toThrow();

    const config = readConfig();
    expect(config.mcpServers.broken).toBeUndefined();
    const logged = logSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(logged).toContain("スキップしました");
  });

  it("starts from an empty mcpServers when no pre-existing MCP config file exists", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir);
    expect(readConfig().mcpServers).toEqual({});
  });

  it("does not touch config.json on a second run", () => {
    writeFileSync(
      join(dir, ".mcp.json"),
      JSON.stringify({ mcpServers: { "playwright-mcp": { command: "npx", args: ["x"] } } }),
      "utf8",
    );
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir);
    const before = readFileSync(join(dir, ".sync-sync-sync", "config.json"), "utf8");

    writeFileSync(join(dir, ".mcp.json"), JSON.stringify({ mcpServers: {} }), "utf8");
    runInit(dir);

    expect(readFileSync(join(dir, ".sync-sync-sync", "config.json"), "utf8")).toBe(before);
  });
});

describe("runInit — enabledToolIds option", () => {
  it("defaults to enabling every registered adapter when omitted", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir);
    expect(readConfig().tools).toEqual({
      "claude-code": { enabled: true },
      cursor: { enabled: true },
      codex: { enabled: true },
    });
  });

  it("marks only the selected tools as enabled, keeping the rest listed but disabled", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir, { enabledToolIds: ["claude-code"] });
    expect(readConfig().tools).toEqual({
      "claude-code": { enabled: true },
      cursor: { enabled: false },
      codex: { enabled: false },
    });
  });
});

describe("runInit — withOnboarding option", () => {
  it("does not write ONBOARDING.md by default", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir);
    expect(existsSync(join(dir, "ONBOARDING.md"))).toBe(false);
  });

  it("writes ONBOARDING.md listing only the enabled tools' managed files when requested", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    runInit(dir, { enabledToolIds: ["claude-code"], withOnboarding: true });

    const doc = readFileSync(join(dir, "ONBOARDING.md"), "utf8");
    const syncedSection = doc.split("## 同期しているもの")[1].split("## 同期していないもの")[0];
    expect(syncedSection).toContain("Claude Code");
    expect(syncedSection).toContain(".mcp.json");
    expect(syncedSection).not.toContain(".cursor/mcp.json");
    expect(syncedSection).not.toContain(".codex/config.toml");
    expect(doc).toContain("Skills");
  });
});
