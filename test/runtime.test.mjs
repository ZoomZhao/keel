import test from "node:test";
import assert from "node:assert/strict";
import { discoverExtensions, ExtensionProcess, validateManifest } from "../packages/runtime/src/index.mjs";

test("validates extension manifests", () => {
  const manifest = validateManifest({
    id: "example",
    name: "Example",
    version: "0.1.0",
    entry: { kind: "process", command: "node", args: [] },
    capabilities: ["search"]
  }, "/tmp/example");

  assert.equal(manifest.dir, "/tmp/example");
  assert.deepEqual(manifest.capabilities, ["search"]);
});

test("rejects unsupported extension kinds", () => {
  assert.throws(() => validateManifest({
    id: "bad",
    name: "Bad",
    version: "0.1.0",
    entry: { kind: "dynamic-library", command: "bad", args: [] },
    capabilities: []
  }, "/tmp/bad"), /Unsupported extension kind/);
});

test("discovers JavaScript example extension", async () => {
  const manifests = await discoverExtensions(["extensions/js"]);
  const ids = manifests.map((manifest) => manifest.id);

  assert.deepEqual(ids, ["hello-world-js"]);
});

test("calls JavaScript extension over JSON Lines RPC", async () => {
  const [manifest] = await discoverExtensions(["extensions/js"]);
  const extension = new ExtensionProcess(manifest);

  try {
    const init = await extension.initialize();
    const search = await extension.request("search.query", { query: "runtime", limit: 1 });

    assert.equal(init.ready, true);
    assert.equal(search.items.length, 1);
    assert.equal(search.items[0].id, "hello");
  } finally {
    extension.stop();
  }
});

