# Contributing

Thanks for considering a contribution to Keel.

## Development

```sh
npm run gen
npm run check
npm run dev
```

If you change `protocol/keel.schema.json`, commit the generated TypeScript and
Rust files.

## Pull requests

- Keep changes focused.
- Add or update tests when behavior changes.
- Update docs when extension contracts change.
- Prefer protocol changes over ad hoc runtime messages.

## Rust

Install the Rust toolchain from <https://rustup.rs/> before working on crates or
Rust extension examples.

```sh
cargo test --workspace
```

