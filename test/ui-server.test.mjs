import test, { after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getOverview, runUiSearch } from "../apps/web-frontend/server.mjs";
import { resetSharedBackendService } from "../apps/node-backend/src/main.mjs";

after(() => {
  resetSharedBackendService();
});

test("ui overview includes extension, protocol, host, and Rust data", async () => {
  const overview = await getOverview();

  assert.equal(overview.project.name, "Keel");
  assert.ok(overview.extensions.some((extension) => extension.id === "hello-world-js"));
  assert.ok(overview.extensions.some((extension) => extension.id === "hello-world-rust"));
  assert.ok(overview.optionalExtensions.some((extension) => extension.id === "keel-file-indexer"));
  assert.equal(overview.webView.windows.length, 2);
  assert.equal(overview.webView.lifecycle.hotkey.accelerator, "Command+Space");
  assert.equal(overview.backend.service, "KeelBackendService");
  assert.ok(overview.backend.features.includes("Capability-based routing"));
  assert.ok(overview.protocol.methods.some((method) => method.name === "search.query"));
  assert.ok(overview.rust.crates.includes("keel-capabilities"));
});

test("ui dashboard shell and search helper are wired", async () => {
  const html = await readFile("apps/web-frontend/index.html", "utf8");
  const app = await readFile("apps/web-frontend/src/App.tsx", "utf8");
  const css = await readFile("apps/web-frontend/src/index.css", "utf8");
  const search = await runUiSearch("ui");

  assert.match(html, /<title>Keel<\/title>/);
  assert.match(app, /keel-topbar/);
  assert.match(app, /showPopover/);
  assert.match(app, /Popover/);
  assert.match(app, /Tooltip/);
  assert.match(app, /Toast/);
  assert.match(app, /showNativeToast/);
  assert.match(app, /hideNativeOverlays/);
  assert.match(app, /registerGlobalHotkey/);
  assert.match(css, /user-select: none/);
  assert.match(css, /--keel-window-control-inset-left/);
  assert.equal(search.extension, "hello-world-js");
  assert.equal(search.search.items[0].title, "Hello from Keel: ui");
  assert.equal(search.search.items[0].extensionId, "hello-world-js");
});

test("ui search helper falls back to the default query", async () => {
  const search = await runUiSearch();

  assert.equal(search.extension, "hello-world-js");
  assert.equal(search.search.items[0].title, "Hello from Keel: keel");
});
