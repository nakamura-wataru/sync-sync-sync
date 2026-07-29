import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ToolAdapter } from "../integrations/types.js";
import { ResolvedConfig } from "./resolve.js";

export type DriftStatus = "in-sync" | "drift" | "missing";

export interface FileDrift {
  toolId: string;
  path: string;
  status: DriftStatus;
}

export function computeDrift(
  adapter: ToolAdapter,
  resolved: ResolvedConfig,
  projectRoot: string,
): FileDrift[] {
  return adapter.render(resolved).map((file): FileDrift => {
    const absolutePath = join(projectRoot, file.path);
    if (!existsSync(absolutePath)) {
      return { toolId: adapter.id, path: file.path, status: "missing" };
    }
    const current = readFileSync(absolutePath, "utf8");
    return {
      toolId: adapter.id,
      path: file.path,
      status: current === file.contents ? "in-sync" : "drift",
    };
  });
}
