import test from "node:test";
import assert from "node:assert/strict";
import { runBackend } from "../apps/node-backend/src/main.mjs";

test("backend initializes and queries an extension", async () => {
  const result = await runBackend({
    extensionDir: "extensions/js/hello-world",
    query: "backend"
  });

  assert.equal(result.extension, "hello-world-js");
  assert.equal(result.init.ready, true);
  assert.equal(result.search.items[0].title, "Hello from Keel: backend");
});

