# Keel

Keel is an open-source starter for building extensible desktop productivity
apps. It keeps the product layer in JavaScript/TypeScript, puts cross-runtime
contracts in one protocol file, and lets high-performance capabilities ship as
Rust-powered extensions.

The repository is intentionally small. It gives you the development foundation:
extension discovery, process supervision, JSON Lines RPC, generated TypeScript
and Rust protocol types, and runnable JavaScript/Rust extension examples.

## Why this shape

Keel follows a few principles from modern hybrid desktop apps:

- Native shells should own platform behavior.
- A shared backend should own product orchestration and extension runtime.
- Web UI should be portable and fast to iterate on.
- Rust should be used for portable, performance-sensitive capabilities.
- Runtime boundaries must be typed and generated from one source of truth.

This repository focuses on the backend, protocol, and extension foundation. A
macOS/Windows host shell and WebView frontend can be layered on top without
changing the extension contract.

## Repository layout

```text
apps/
  desktop-host/        Local demo host plus WebView window config.
  native-shells/       macOS WKWebView and Windows WebView2 shell templates.
  node-backend/        Long-lived backend process and extension supervisor.
  web-frontend/        Vite, React, shadcn/ui developer console.
crates/
  keel-capabilities/   Rust capability registry and search foundation.
  keel-extension-sdk/  Rust helper SDK for extension authors.
  keel-protocol/       Generated Rust protocol types.
extensions/
  js/hello-world/      JavaScript extension example.
  rust/hello-world/    Rust extension example.
packages/
  host-config/         WebView host config loader and validator.
  js-extension-sdk/    JavaScript helper SDK for extension authors.
  native-bridge/       Browser-to-native message envelope helpers.
  protocol/            Generated TypeScript protocol types.
  runtime/             Extension discovery, RPC, and process management.
protocol/
  keel.schema.json     Single source of truth for runtime contracts.
tools/
  generate-protocol.mjs
  check-workspace.mjs
```

Useful docs:

- `ARCHITECTURE.md` explains the runtime boundaries.
- `docs/extension-authoring.md` explains extension manifests and RPC.
- `docs/raycast-deep-dive-notes.md` captures the source article takeaways.

## Quick start

```sh
npm run gen
npm run check
npm run test:node
npm run ui
npm run dev
```

`npm run dev` starts the demo host and runs the JavaScript extension. Rust is
not required for the JavaScript path.

`npm run ui` starts the local graphical console at `http://localhost:5173`. It
uses Vite, React, Tailwind CSS, and shadcn/ui components, and calls the same
backend/extension APIs as the command-line demo.

Native shell templates load that same UI:

```sh
npm run native:macos
npm run native:windows
```

The macOS shell requires a matching Xcode/Command Line Tools Swift toolchain.
The Windows shell requires the .NET SDK on Windows.

To run the Rust sample extension, install the Rust toolchain and build it:

```sh
cargo run --manifest-path extensions/rust/hello-world/Cargo.toml
```

Then point the extension manifest at the compiled binary or wrap it with a
small command script for local development.

## WebView host config

`apps/desktop-host/webview.config.json` defines the windows a native shell
should create and the platform-specific WebView defaults it should apply. It
includes macOS WKWebView settings and Windows WebView2 settings for transparent
launcher windows, warm rendering, native popovers, and background throttling
behavior.

The config is loaded and validated by `packages/host-config`.

## Graphical console

`apps/web-frontend` is the first user-facing UI. It gives new users a fast way
to see the foundation working:

- Run a demo extension search through the Node backend.
- Inspect discovered JavaScript and Rust extension manifests.
- Inspect WebView window configuration.
- Inspect generated protocol methods.
- Inspect Rust capability crates and primitives.

## Backend service

`apps/node-backend/src/service.mjs` provides the long-lived service foundation:
extension discovery, capability-based routing, process warmup, command routing,
and health checks. The UI server uses this service for `/api/search`, so an
extension process stays warm across multiple queries instead of being started
for a single request and immediately stopped.

## Extension model

Every extension has a `manifest.json`:

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

The backend starts the extension process, sends JSON Lines requests on stdin,
and reads JSON Lines responses from stdout. The same transport works for Node,
Rust, Go, Python, or any language that can read and write lines.

`packages/js-extension-sdk` includes small authoring helpers for Action Panel
descriptors, Toast descriptors, and async local KV storage.

## Native bridge

`packages/native-bridge` defines the browser-to-host message envelope used by
the WebView UI. The macOS shell registers a `keelHost` WKScriptMessageHandler
and the Windows shell registers WebView2 `WebMessageReceived`. Current bridge
methods cover host readiness, window show/hide/focus, toast requests,
clipboard text writes, and the placeholder contract for global hotkey
registration.

## Protocol workflow

Edit `protocol/keel.schema.json`, then run:

```sh
npm run gen
```

The generator writes:

- `packages/protocol/src/generated.ts`
- `crates/keel-protocol/src/generated.rs`

CI checks that generated files are current.

## Design status

This is a foundation, not a full desktop app. The next useful layers are:

- Real global hotkey and menubar/tray implementations in the native shells.
- Native tooltip/popover rendering outside WebView bounds.
- Deeper Rust capabilities for file indexing, embeddings, and sync.
- A permission system for extension access to files, network, and secrets.

## Tests

```sh
npm run check
npm run test:node
npm run test:rust
```

The Node test suite covers protocol generation, WebView config validation,
extension manifest validation, JSON Lines RPC, and backend orchestration.
`test:rust` runs the Rust crate tests when the Rust toolchain is installed.
