# WebView Hosting

Keel ships first-pass native macOS and Windows shells plus the configuration
contract they consume.

`apps/desktop-host/webview.config.json` contains:

- Frontend dev and production locations.
- Window definitions for launcher and settings surfaces.
- macOS WKWebView defaults.
- Windows WebView2 defaults.
- Native behavior flags such as transparency, floating windows, task switcher
  visibility, native tooltips, and native popovers.
- A shared launcher lifecycle policy: prewarm hidden, show on `host.ready`,
  hide launcher windows on close, and focus from a registered hotkey.

## macOS shell expectations

The AppKit shell:

- Create WKWebView-backed windows from the `windows` array.
- Register `window.webkit.messageHandlers.keelHost` for browser-to-native
  messages.
- Prewarm the launcher hidden when `prewarmBeforeShow` is enabled, then show it
  on `host.ready`.
- Handle host readiness, window show/hide/focus, toast logging, clipboard text
  reads/writes, global hotkey registration, and native popover/tooltip panels.
- Send native-to-web events through `window.dispatchEvent` with the
  `keel:native-event` name.

The next AppKit layer should:

- Disable window occlusion detection when configured.
- Keep transparent window and WebView backgrounds aligned.
- Replace the first `NSEvent` hotkey monitor with a lower-level registration if
  the app needs conflict detection or event swallowing across every macOS app.

## Windows shell expectations

The WPF shell:

- Create WebView2 environments from the config.
- Apply additional browser arguments before WebView initialization.
- Register `WebMessageReceived` for browser-to-native messages.
- Prewarm the launcher hidden when `prewarmBeforeShow` is enabled, then show it
  on `host.ready`.
- Handle host readiness, window show/hide/focus, toast logging, clipboard text
  reads/writes, `RegisterHotKey`, and native popover/tooltip `Popup` surfaces.
- Send native-to-web events through WebView2 `PostWebMessageAsJson`.

The next WPF or WinUI layer should:

- Coordinate transparent/acrylic backgrounds between native chrome and WebView2.
- Avoid renderer background throttling for warm launcher surfaces.
- Add conflict and unregister flows around global hotkeys.

## Validation

`packages/host-config` validates the config at development time and is covered
by `npm run test:node`.

## Local React console

`apps/web-frontend` provides a Vite React console for validating the host
contract before native shells exist. It uses shadcn/ui components and calls the
same `/api/overview`, `/api/config`, and `/api/search` endpoints exposed by
`apps/web-frontend/server.mjs`.

```sh
npm run ui
```

Open `http://localhost:5173` to run the demo extension and inspect WebView,
protocol, and Rust capability state.
