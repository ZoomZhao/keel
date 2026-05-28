# Raycast 2.0 Deep Dive Notes

Source: https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast

Raycast 2.0 is useful as a reference because it makes the runtime boundaries
explicit:

- Platform host: Swift/AppKit on macOS, C#/.NET/WPF on Windows.
- Shared UI: React and TypeScript in system WebViews.
- Shared backend: a long-lived Node process for business logic and extension
  runtime.
- Rust core: portable and performance-sensitive data, sync, and indexing.

The important lesson for Keel is not to copy every technology choice. The
reusable idea is to keep platform-native behavior in a thin host, keep most
product work in shared web/backend code, and make runtime boundaries typed.

## Design implications for Keel

- Start protocol-first so native, Node, WebView, and Rust cannot drift.
- Use process isolation for extensions before optimizing transport.
- Keep Rust extensions ABI-stable by using JSON Lines first.
- Make the backend the extension supervisor, not the UI.
- Leave room for native shells to expose OS APIs later.
- Treat memory and startup behavior as product requirements, not cleanup work.
- Keep WebView startup and throttling behavior explicit in host configuration
  so native shells do not drift per platform.
- Keep file indexing as an opt-in Rust sidecar capability until an app has real
  path scopes, persistence, and permission prompts.
