import * as core from "@actions/core";
import * as exec from "@actions/exec";
import * as io from "@actions/io";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { load as tomlLoad } from "js-toml";

export const CARGO_HOME = process.env.CARGO_HOME || path.join(os.homedir(), ".cargo");
export const RUSTUP_HOME = process.env.RUSTUP_HOME || path.join(os.homedir(), ".rustup");

export interface ToolchainInputs {
  toolchain: string;
  components: string[];
  targets: string[];
  workingDirectory: string;
}

export function getInputs(): ToolchainInputs & { cacheOnFailure: boolean } {
  const components = core
    .getInput("components")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const targets = core
    .getInput("targets")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return {
    toolchain: core.getInput("toolchain"),
    components,
    targets,
    workingDirectory: core.getInput("working-directory") || ".",
    cacheOnFailure: (core.getInput("cache-on-failure") || "true").toLowerCase() === "true",
  };
}

export async function resolveToolchain(
  workingDirectory: string,
  toolchainInput: string,
): Promise<string> {
  if (toolchainInput) {
    return toolchainInput;
  }

  const file = path.resolve(workingDirectory, "rust-toolchain.toml");
  let content: string;
  try {
    content = await fs.readFile(file, "utf8");
  } catch (error) {
    throw new Error(
      `failed to read ${file}, and no "toolchain" input provided: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const parsed = tomlLoad(content) as { toolchain?: { channel?: unknown } };
  const channel = parsed.toolchain?.channel;
  if (typeof channel !== "string" || !channel) {
    throw new Error(`no channel found in ${file}, and no "toolchain" input provided`);
  }
  return channel;
}

export async function installRustup(): Promise<void> {
  const existing = await io.which("rustup", false);
  if (existing) {
    return;
  }

  core.info("rustup not found, installing");
  if (process.platform === "win32") {
    const arch = os.arch() === "arm64" ? "aarch64" : "x86_64";
    const dest = path.join(process.env.RUNNER_TEMP || os.tmpdir(), "rustup-init.exe");
    await exec.exec("curl", [
      "--proto",
      "=https",
      "--tlsv1.2",
      "--retry",
      "10",
      "--retry-connrefused",
      "-sSf",
      "-o",
      dest,
      `https://win.rustup.rs/${arch}`,
    ]);
    await exec.exec(dest, ["--default-toolchain", "none", "--no-modify-path", "-y"]);
  } else {
    await exec.exec("bash", [
      "-c",
      "curl --proto '=https' --tlsv1.2 --retry 10 --retry-connrefused -sSf https://sh.rustup.rs | sh -s -- --default-toolchain none -y --no-modify-path",
    ]);
  }
  core.addPath(path.join(CARGO_HOME, "bin"));
}

export async function installToolchain(inputs: ToolchainInputs): Promise<void> {
  const args = [
    "toolchain",
    "install",
    inputs.toolchain,
    "--profile",
    "minimal",
    "--no-self-update",
  ];
  for (const component of inputs.components) {
    args.push("--component", component);
  }
  for (const target of inputs.targets) {
    args.push("--target", target);
  }
  await exec.exec("rustup", args);

  await exec.exec("rustup", ["default", inputs.toolchain]);
}

export async function rustcCommitHash(): Promise<string> {
  let out = "";
  await exec.exec("rustc", ["-vV"], {
    listeners: {
      stdout: (data) => {
        out += data.toString();
      },
    },
  });
  const match = /^commit-hash:\s*(\S+)/m.exec(out);
  if (!match) {
    throw new Error(`failed to parse rustc commit hash from:\n${out}`);
  }
  return match[1].slice(0, 8);
}
