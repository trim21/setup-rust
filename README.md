# setup-rust

A GitHub Action to set up the Rust toolchain pinned in `rust-toolchain.toml`, with caching for rustup toolchains and cargo artifacts.

## Usage

Given a `rust-toolchain.toml`:

```toml
[toolchain]
channel = "1.89.0"
components = ["rustfmt", "clippy"]
```

```yaml
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: trim21/setup-rust@v0.0.1
        with:
          components: rustfmt # extra components on top of rust-toolchain.toml

      - run: cargo test
```

For a monorepo where `rust-toolchain.toml` is not at the repository root:

```yaml
- uses: trim21/setup-rust@v0.0.1
  with:
    working-directory: crates/foo
```

To install a toolchain explicitly instead of reading `rust-toolchain.toml`:

```yaml
- uses: trim21/setup-rust@v0.0.1
  with:
    toolchain: nightly
```

## What it does

1. Parses the `channel` from `rust-toolchain.toml` (or the `toolchain` input).
2. Installs rustup if it is missing.
3. Runs `rustup toolchain install <toolchain> --profile minimal` with the requested components and targets, and sets it as the default toolchain.
4. Restores two caches (and saves them in the post step):
   - **rustup cache**: `$RUSTUP_HOME/toolchains` and `settings.toml`, keyed by toolchain and requested components/targets. On a hit, `rustup toolchain install` becomes a no-op.
   - **crates cache**: `$CARGO_HOME/registry`, `$CARGO_HOME/git` and the workspace `target` directory, keyed by the rustc commit hash and a hash of all `Cargo.toml` / `Cargo.lock` / `.cargo/config.toml` / `rust-toolchain(.toml)` files.

Only the default cargo target directory (`<working-directory>/target`) is cached; a custom `build.target-dir` in `.cargo/config.toml` is not picked up (though `config.toml` changes do invalidate the cache key).

## Inputs

| input               | description                                                        | default                            |
| ------------------- | ------------------------------------------------------------------ | ---------------------------------- |
| `toolchain`         | Toolchain to install, overriding the `rust-toolchain.toml` channel | channel from `rust-toolchain.toml` |
| `components`        | Comma-separated extra components to install                        | `''`                               |
| `targets`           | Comma-separated target triples to install                          | `''`                               |
| `working-directory` | Directory containing `rust-toolchain.toml`                         | `.`                                |
| `cache-on-failure`  | Save caches even when the workflow fails                           | `true`                             |

## Outputs

| output      | description                      |
| ----------- | -------------------------------- |
| `toolchain` | The toolchain that was installed |

## Release flow

Push a `src/vN` tag to trigger the `deploy` workflow, which builds `dist/`, publishes it to the `dist/v0` branch and creates a `vN` tag and GitHub release from the version in `package.json`.

## License

[MIT](./LICENSE)
