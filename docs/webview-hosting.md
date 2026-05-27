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

## macOS shell expectations

The AppKit shell:

- Create WKWebView-backed windows from the `windows` array.
- Register `window.webkit.messageHandlers.keelHost` for browser-to-native
  messages.
- Handle host readiness, window show/hide/focus, toast logging, and clipboard
  text writes.

The next AppKit layer should:

- Keep launcher windows warm before showing them when `prewarmBeforeShow` is
  enabled.
- Disable window occlusion detection when configured.
- Render native popovers and tooltips outside WebView bounds.
- Keep transparent window and WebView backgrounds aligned.

## Windows shell expectations

The WPF shell:

- Create WebView2 environments from the config.
- Apply additional browser arguments before WebView initialization.
- Register `WebMessageReceived` for browser-to-native messages.
- Handle host readiness, window show/hide/focus, toast logging, and clipboard
  text writes.

The next WPF or WinUI layer should:

- Coordinate transparent/acrylic backgrounds between native chrome and WebView2.
- Avoid renderer background throttling for warm launcher surfaces.
- Render native popovers and tooltips outside WebView bounds.

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
