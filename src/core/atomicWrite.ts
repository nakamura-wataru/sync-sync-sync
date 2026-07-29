import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";

export type WriteResult = "unchanged" | "written";

export function writeFileIdempotent(absolutePath: string, contents: string): WriteResult {
  if (existsSync(absolutePath) && readFileSync(absolutePath, "utf8") === contents) {
    return "unchanged";
  }

  const dir = dirname(absolutePath);
  mkdirSync(dir, { recursive: true });
  const tmpPath = `${dir}/.${basename(absolutePath)}.tmp-${process.pid}`;
  writeFileSync(tmpPath, contents, "utf8");
  renameSync(tmpPath, absolutePath);
  return "written";
}
