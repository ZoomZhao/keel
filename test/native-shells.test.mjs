import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("macOS shell reads the shared WebView host config", async () => {
  const source = await readFile("apps/native-shells/macos/Sources/KeelMacShell/main.swift", "utf8");
  const manifest = await readFile("apps/native-shells/macos/Package.swift", "utf8");

  assert.match(manifest, /executable\(name: "KeelMacShell"/);
  assert.match(source, /import WebKit/);
  assert.match(source, /desktop-host\/webview\.config\.json/);
  assert.match(source, /WKWebView/);
  assert.match(source, /WKScriptMessageHandler/);
  assert.match(source, /name: "keelHost"/);
  assert.match(source, /clipboard\.writeText/);
  assert.match(source, /globalHotkey\.register/);
  assert.match(source, /popover\.show/);
  assert.match(source, /tooltip\.show/);
  assert.match(source, /prewarmBeforeShow/);
  assert.match(source, /windowShouldClose/);
  assert.match(source, /config\.frontend\.devUrl/);
});

test("Windows shell reads the shared WebView host config", async () => {
  const project = await readFile("apps/native-shells/windows/Keel.WindowsShell.csproj", "utf8");
  const xaml = await readFile("apps/native-shells/windows/MainWindow.xaml", "utf8");
  const source = await readFile("apps/native-shells/windows/MainWindow.xaml.cs", "utf8");

  assert.match(project, /Microsoft\.Web\.WebView2/);
  assert.match(project, /net9\.0-windows/);
  assert.match(xaml, /WebView2/);
  assert.match(source, /desktop-host\/webview\.config\.json/);
  assert.match(source, /WebMessageReceived/);
  assert.match(source, /AdditionalBrowserArguments/);
  assert.match(source, /clipboard\.writeText/);
  assert.match(source, /RegisterHotKey/);
  assert.match(source, /globalHotkey\.register/);
  assert.match(source, /popover\.show/);
  assert.match(source, /tooltip\.show/);
  assert.match(source, /PrewarmBeforeShow/);
  assert.match(source, /CoreWebView2\.Navigate/);
});
