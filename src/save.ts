import * as cache from "@actions/cache";
import * as core from "@actions/core";
import fs from "node:fs/promises";
import { STATE_CACHES } from "./cache";
import type { CacheEntry } from "./cache";

async function existing(paths: string[]): Promise<string[]> {
  const result: string[] = [];
  for (const p of paths) {
    try {
      await fs.access(p);
      result.push(p);
    } catch {
      core.info(`skipping non-existent cache path: ${p}`);
    }
  }
  return result;
}

async function run(): Promise<void> {
  const raw = core.getState(STATE_CACHES);
  if (!raw) {
    core.info("no cache state to save");
    return;
  }

  const entries = JSON.parse(raw) as CacheEntry[];
  for (const entry of entries) {
    if (entry.hit) {
      continue;
    }
    const paths = await existing(entry.paths);
    if (paths.length === 0) {
      core.info(`nothing to save for ${entry.name} cache`);
      continue;
    }
    try {
      const key = await cache.saveCache(paths, entry.key);
      core.info(`saved ${entry.name} cache: ${key}`);
    } catch (error) {
      core.warning(
        `failed to save ${entry.name} cache ${entry.key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

void run();
