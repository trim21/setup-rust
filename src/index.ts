import * as core from "@actions/core";
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

  // restore before installing so that `rustup toolchain install` becomes a fast no-op on cache hit
  const toolchainCache = await restore(
    "rustup",
    [path.join(RUSTUP_HOME, "toolchains"), path.join(RUSTUP_HOME, "settings.toml")],
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
