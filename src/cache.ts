import * as cache from "@actions/cache";
import * as core from "@actions/core";
import * as glob from "@actions/glob";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";

export const STATE_CACHES = "CACHES";

export interface CacheEntry {
  name: string;
  paths: string[];
  key: string;
  restoreKeys: string[];
  hit: boolean;
}

export async function restore(
  name: string,
  paths: string[],
  key: string,
  restoreKeys: string[] = [],
): Promise<CacheEntry> {
  let hit: string | undefined;
  try {
    hit = await cache.restoreCache(paths, key, restoreKeys);
  } catch (error) {
    core.warning(
      `${name} cache restore failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (hit) {
    core.info(`${name} cache hit: ${hit}`);
  } else {
    core.info(`${name} cache miss: key=${key}`);
  }
  return { name, paths, key, restoreKeys, hit: hit !== undefined };
}

export function runnerKey(): string {
  return `${os.type()}-${os.arch()}`;
}

export function toolchainCacheKey(
  toolchain: string,
  components: string[],
  targets: string[],
): string {
  const salt = crypto
    .createHash("sha1")
    .update(JSON.stringify([components, targets]))
    .digest("hex")
    .slice(0, 8);
  return `setup-rust-rustup-${runnerKey()}-${toolchain}-${salt}`;
}

async function hashFiles(files: string[]): Promise<string> {
  const hasher = crypto.createHash("sha1");
  for (const file of files.toSorted()) {
    hasher.update(file);
    hasher.update(await fs.readFile(file));
  }
  return hasher.digest("hex").slice(0, 8);
}

export async function cratesCacheKeys(
  workingDirectory: string,
  rustHash: string,
): Promise<{ key: string; restoreKeys: string[] }> {
  const globber = await glob.create(
    [
      `${workingDirectory}/**/Cargo.toml`,
      `${workingDirectory}/**/Cargo.lock`,
      `${workingDirectory}/**/.cargo/config.toml`,
      `${workingDirectory}/rust-toolchain`,
      `${workingDirectory}/rust-toolchain.toml`,
    ].join("\n"),
    { followSymbolicLinks: false },
  );
  const files: string[] = [];
  for (const file of await globber.glob()) {
    const stat = await fs.stat(file);
    if (stat.isFile()) {
      files.push(file);
    }
  }

  const lockHash = await hashFiles(files);
  const prefix = `setup-rust-crates-${runnerKey()}-${rustHash}`;
  return { key: `${prefix}-${lockHash}`, restoreKeys: [prefix] };
}
