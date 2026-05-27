# Extension Authoring

Keel extensions are local processes that speak JSON Lines RPC over stdin and
stdout. This keeps the extension ABI stable and language-neutral.

## Manifest

Each extension has a `manifest.json`:

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "0.1.0",
  "entry": {
    "kind": "node",
    "command": "node",
    "args": ["src/index.mjs"]
  },
  "capabilities": ["search", "commands"]
}
```

`entry.kind` is descriptive. The runtime executes `entry.command` and
`entry.args`, so Rust extensions can run as compiled binaries, `cargo run`
during development, or any process wrapper.

## RPC shape

Requests:

```json
{"id":"1","method":"search.query","params":{"query":"keel","limit":5}}
```

Responses:

```json
{"id":"1","result":{"items":[]}}
```

Errors:

```json
{"id":"1","error":{"code":"method_not_found","message":"Unsupported method"}}
```

## JavaScript extensions

Use `packages/js-extension-sdk`:

```js
import { serve } from "@keel/js-extension-sdk";

serve({
  "extension.initialize": async () => ({ ready: true }),
  "search.query": async ({ query }) => ({ items: [{ id: "1", title: query }] }),
  "command.run": async () => ({ ok: true })
});
```

The repository example imports the SDK by relative path so it works before
publishing packages.

## Rust extensions

Use `crates/keel-extension-sdk`:

```rust
use keel_extension_sdk::{serve, ExtensionHandlers, RpcResult};
use keel_protocol::{InitializeParams, InitializeResult};

struct Extension;

impl ExtensionHandlers for Extension {
    fn initialize(&self, _params: InitializeParams) -> RpcResult<InitializeResult> {
        Ok(InitializeResult { ready: true, message: None })
    }

    // Implement search_query and command_run.
}

fn main() {
    serve(Extension);
}
```

For production, point the manifest command at the compiled binary instead of
`cargo run`.

## Capability roadmap

The manifest currently declares coarse capabilities. The next layer should add
permission prompts and scoped grants for:

- Filesystem paths.
- Network hosts.
- Secrets and tokens.
- Clipboard access.
- Native OS actions.
- Long-running background services.

