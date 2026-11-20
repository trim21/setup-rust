import * as core from "@actions/core";
import fs from "node:fs/promises";
import path from "node:path";
import {
  CARGO_HOME,
  RUSTUP_HOME,
  getInputs,
  installRustup,
  installToolchain,
  resolveToolchain,
  rustcCommitHash,
} from "./toolchain";
import { cratesCacheKeys, restore, STATE_CACHES, toolchainCacheKey } from "./cache";
import type { CacheEntry } from "./cache";

async function run(): Promise<void> {
  const inputs = getInputs();
  core.exportVariable("CACHE_ON_FAILURE", inputs.cacheOnFailure ? "true" : "false");

  const toolchain = await resolveToolchain(inputs.workingDirectory, inputs.toolchain);

  // a cache restore merges into the runner image's preinstalled toolchains instead of replacing
  // them, and rustup refuses to overwrite files left over from a different version
  const toolchainsDir = path.join(RUSTUP_HOME, "toolchains");
  await fs.rm(toolchainsDir, { recursive: true, force: true });

  // restore before installing so that `rustup toolchain install` becomes a fast no-op on cache hit
  const toolchainCache = await restore(
    "rustup",
    [toolchainsDir, path.join(RUSTUP_HOME, "settings.toml")],
    toolchainCacheKey(toolchain, inputs.components, inputs.targets),
  );

  await installRustup();
  await installToolchain({ ...inputs, toolchain });

  const rustHash = await rustcCommitHash();
  const cratesKeys = await cratesCacheKeys(path.resolve(inputs.workingDirectory), rustHash);
  const cratesCache = await restore(
    "crates",
    [
      path.join(CARGO_HOME, "registry"),
      path.join(CARGO_HOME, "git"),
      path.resolve(inputs.workingDirectory, "target"),
    ],
    cratesKeys.key,
    cratesKeys.restoreKeys,
  );

  const caches: CacheEntry[] = [toolchainCache, cratesCache];
  core.saveState(STATE_CACHES, JSON.stringify(caches));
  core.setOutput("toolchain", toolchain);
}

run().catch((error: unknown) => core.setFailed(error instanceof Error ? error : String(error)));
