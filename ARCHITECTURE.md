# Architecture

Keel splits the app into four boundaries:

1. Host shell
2. Web frontend
3. Node backend
4. Rust capabilities and extensions

The repository implements the backend, protocol, and extension pieces first.
Those are the parts that define the development foundation and extension
surface area.

`apps/desktop-host/webview.config.json` is the initial native-host contract. It
defines windows, frontend entry points, and platform-specific WebView defaults
that future Swift and C# shells can consume.

`apps/web-frontend` is a Vite React console built with shadcn/ui components. It
is intentionally wired to the same backend APIs that a native WebView shell will
load, so newcomers can validate the foundation before any native shell is
implemented.

`apps/native-shells` contains the first native shell templates: a Swift/AppKit
WKWebView host for macOS and a WPF/WebView2 host for Windows. They both read the
same WebView host config and load the shared React console.

## Process model

```text
Native host shell
  |
  | platform messages
  v
Web frontend <-> Node backend <-> extension process
                                |
                                +-- JavaScript extension
                                +-- Rust extension
                                +-- any JSON Lines extension
```

The Node backend is long-lived. It owns extension discovery, process lifecycle,
request routing, and product services. Extensions are separate processes so a
slow or crashing extension cannot take down the backend.

`KeelBackendService` is the first concrete service layer. It discovers
manifests from configured roots, warms extension processes on demand, routes
requests by capability, exposes health metadata, and shuts down children when
the host exits. The UI server uses this service instead of the one-shot demo
path.

## Protocol-first contracts

`protocol/keel.schema.json` declares records and RPC methods. Generated clients
and types keep runtime boundaries explicit.

Current generated targets:

- TypeScript types for frontend/backend code.
- Rust structs for native capabilities and Rust extensions.

Additional targets can be added without changing extension manifests.

## Extension lifecycle

1. Discover extension manifests under configured roots.
2. Validate the manifest shape and declared capabilities.
3. Start the entry command with the manifest directory as cwd.
4. Send `extension.initialize`.
5. Keep initialized processes warm while the service is alive.
6. Route capability calls such as `search.query` and `command.run`.
7. Stop the child process on shutdown or after health check failure.

## Rust extension strategy

Rust extensions use the same process protocol as JavaScript extensions. That is
deliberate: it keeps ABI stability, avoids unsafe dynamic loading in the first
version, and works across platforms.

The first supported Rust shape is a binary extension using stdin/stdout JSON
Lines. Later versions can add:

- Wasmtime modules for sandboxed compute.
- Native dynamic libraries for trusted local capabilities.
- Long-running Rust sidecars for indexing or model inference.

Those modes should keep the same method contracts from
`protocol/keel.schema.json`.

## Rust capability foundation

`crates/keel-capabilities` contains the first shared Rust capability primitives:

- `CapabilityRegistry` for registering local capabilities by id and declared
  capability names.
- `InMemorySearchIndex` as a small testable base for future file indexing,
  command search, settings search, and local knowledge search.

This crate is deliberately independent of any host shell. It can later be used
from Rust sidecars, native host bridges, or Rust extensions.

## Native host strategy

The host shell should own platform behavior: global hotkeys, focus rules,
native popovers, tray/menu bar integration, accessibility APIs, file dialogs,
window materials, and WebView configuration.

The WebView should own UI composition. It should not emulate OS behavior where
the platform already has a stronger primitive.

`packages/native-bridge` defines the current WebView-to-native envelope:
`{ id, method, params }`. The macOS shell registers
`window.webkit.messageHandlers.keelHost`, and the Windows shell listens for
WebView2 messages. Implemented host-side methods include readiness,
show/hide/focus, toast logging, and clipboard text writes; global hotkey
registration and clipboard reads are reserved in the bridge contract for the
next native integration pass.

## Performance rules

- Keep extensions out of the main backend process.
- Load extensions lazily and keep warm only when recent activity justifies it.
- Use Rust for file indexing, parsing, search, sync, and other predictable
  memory workloads.
- Track process memory separately for backend, WebView, native shell, and
  extensions.
- Treat generated protocol drift as a CI failure.
