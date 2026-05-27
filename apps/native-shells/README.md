# Native Shells

Keel keeps native shells thin. The native layer owns OS behavior and WebView
configuration, while the React UI and Node backend remain shared.

Both shells read the shared host contract:

```text
apps/desktop-host/webview.config.json
```

The default frontend URL is `http://localhost:5173`, served by:

```sh
npm run ui
```

## macOS

The macOS shell is a Swift Package executable using AppKit and WKWebView.

```sh
npm run native:macos
```

Build/run requires an Xcode or Command Line Tools installation whose Swift
compiler matches the installed macOS SDK. If SwiftPM fails before compiling the
package manifest with an SDK/compiler mismatch, update Xcode/CLT with
`xcode-select`.

Responsibilities:

- Create the launcher window from WebView config.
- Use a transparent floating window for the launcher surface.
- Load the shared Vite React console.
- Keep native window behavior outside the WebView.

## Windows

The Windows shell is a WPF project using WebView2.

```sh
npm run native:windows
```

Responsibilities:

- Create the launcher window from WebView config.
- Use transparent/custom chrome settings where configured.
- Load the shared Vite React console.
- Keep native popovers, tooltips, and future OS APIs outside the WebView.

The Windows shell is intended to build on Windows with the .NET SDK installed.
