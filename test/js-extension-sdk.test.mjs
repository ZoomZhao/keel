import test from "node:test";
import assert from "node:assert/strict";

import {
  createAction,
  createActionPanel,
  createMemoryStorage,
  showToast
} from "../packages/js-extension-sdk/src/index.mjs";

test("js extension sdk creates action panel and toast descriptors", () => {
  const action = createAction({ id: "open", title: "Open", shortcut: "cmd+o" });
  const panel = createActionPanel([action]);
  const toast = showToast({ title: "Saved", message: "Done" });

  assert.deepEqual(panel.actions, [{
    id: "open",
    title: "Open",
    style: "default",
    shortcut: "cmd+o"
  }]);
  assert.deepEqual(toast, {
    title: "Saved",
    message: "Done",
    style: "success"
  });
});

test("js extension sdk validates required descriptor fields", () => {
  assert.throws(() => createAction({ title: "Missing id" }), /requires id and title/);
  assert.throws(() => showToast({ message: "Missing title" }), /requires title/);
  assert.throws(() => createActionPanel({}), /must be an array/);
});

test("js extension sdk memory storage behaves like async kv storage", async () => {
  const storage = createMemoryStorage({ theme: "system" });

  assert.equal(await storage.get("theme"), "system");
  await storage.set("query", "keel");
  assert.equal(await storage.get("query"), "keel");
  await storage.remove("theme");
  assert.deepEqual(await storage.entries(), { query: "keel" });
  await storage.clear();
  assert.deepEqual(await storage.entries(), {});
});
