import test from "node:test";
import assert from "node:assert/strict";
import { loadWebViewConfig, validateWebViewConfig } from "../packages/host-config/src/index.mjs";

test("loads desktop WebView config", async () => {
  const config = await loadWebViewConfig();

  assert.equal(config.name, "Keel Desktop Host");
  assert.equal(config.windows.length, 2);
  assert.equal(config.lifecycle.hotkey.accelerator, "Command+Space");
  assert.equal(config.platform.macos.webKit.viewClass, "WKWebView");
  assert.equal(config.platform.windows.webView2.transparentBackground, true);
  assert.equal(config.platform.windows.webView2.prewarmBeforeShow, true);
});

test("rejects duplicate WebView window ids", () => {
  const config = {
    name: "Bad Host",
    version: "0.1.0",
    frontend: { devUrl: "http://localhost:5173", distDir: "dist" },
    windows: [
      { id: "main", title: "Main", kind: "launcher", size: { width: 1, height: 1 } },
      { id: "main", title: "Other", kind: "panel", size: { width: 1, height: 1 } }
    ]
  };

  assert.throws(() => validateWebViewConfig(config), /Duplicate window id/);
});

test("rejects unknown WebView window kinds", () => {
  const config = {
    name: "Bad Host",
    version: "0.1.0",
    frontend: { devUrl: "http://localhost:5173", distDir: "dist" },
    windows: [
      { id: "main", title: "Main", kind: "browser", size: { width: 1, height: 1 } }
    ]
  };

  assert.throws(() => validateWebViewConfig(config), /kind must be one of/);
});

test("rejects invalid WebView window size values", () => {
  const config = {
    name: "Bad Host",
    version: "0.1.0",
    frontend: { devUrl: "http://localhost:5173", distDir: "dist" },
    windows: [
      { id: "main", title: "Main", kind: "launcher", size: { width: 0, height: 1 } }
    ]
  };

  assert.throws(() => validateWebViewConfig(config), /size\.width must be a positive integer/);
});

test("rejects invalid WebView routes and platform sections", () => {
  assert.throws(() => validateWebViewConfig({
    name: "Bad Host",
    version: "0.1.0",
    frontend: { devUrl: "http://localhost:5173", distDir: "dist" },
    windows: [
      { id: "main", title: "Main", kind: "launcher", route: 42, size: { width: 1, height: 1 } }
    ]
  }), /route must be a non-empty string/);

  assert.throws(() => validateWebViewConfig({
    name: "Bad Host",
    version: "0.1.0",
    frontend: { devUrl: "http://localhost:5173", distDir: "dist" },
    windows: [
      { id: "main", title: "Main", kind: "launcher", size: { width: 1, height: 1 } }
    ],
    platform: {
      macos: "bad"
    }
  }), /platform\.macos must be an object/);
});
