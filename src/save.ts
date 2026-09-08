import * as cache from "@actions/cache";
import * as core from "@actions/core";
import { STATE_CACHES } from "./cache";
import type { CacheEntry } from "./cache";

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
    try {
      const key = await cache.saveCache(entry.paths, entry.key);
      core.info(`saved ${entry.name} cache: ${key}`);
    } catch (error) {
      core.warning(
        `failed to save ${entry.name} cache ${entry.key}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}

void run();
