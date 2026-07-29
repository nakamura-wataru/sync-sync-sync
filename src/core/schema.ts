import { z } from "zod";

export const EnvValueSchema = z.union([z.string(), z.object({ secret: z.string() })]);

export const McpServerSchema = z
  .object({
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(EnvValueSchema).optional(),
    url: z.string().optional(),
    headers: z.record(EnvValueSchema).optional(),
  })
  // MCPクライアントごとに command/args/env/url/headers 以外の独自フィールド（例: "type": "http"）を
  // 使うことがあるため、未知フィールドを剥ぎ取らずそのまま通す。
  .passthrough()
  .refine((server) => Boolean(server.command) || Boolean(server.url), {
    message: "mcpServers entry must define either 'command' or 'url'",
  });

export const ToolConfigSchema = z.object({
  enabled: z.boolean(),
});

export const ConfigSchema = z.object({
  version: z.literal(1),
  tools: z.record(ToolConfigSchema),
  instructions: z.object({
    source: z.string(),
  }),
  mcpServers: z.record(McpServerSchema).default({}),
});

export const LocalSecretsSchema = z.object({
  secrets: z.record(z.string()).default({}),
});

export type EnvValue = z.infer<typeof EnvValueSchema>;
export type McpServer = z.infer<typeof McpServerSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type LocalSecrets = z.infer<typeof LocalSecretsSchema>;
