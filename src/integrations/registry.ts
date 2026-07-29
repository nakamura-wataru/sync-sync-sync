import { claudeCodeAdapter } from "./claude-code.js";
import { codexAdapter } from "./codex.js";
import { cursorAdapter } from "./cursor.js";
import { ToolAdapter } from "./types.js";

export const ADAPTERS: ToolAdapter[] = [claudeCodeAdapter, cursorAdapter, codexAdapter];

export function getAdapter(id: string): ToolAdapter | undefined {
  return ADAPTERS.find((adapter) => adapter.id === id);
}
