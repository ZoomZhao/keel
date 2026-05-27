import test from "node:test";
import assert from "node:assert/strict";

import { KeelBackendService } from "../apps/node-backend/src/service.mjs";

test("backend service keeps extension processes warm across searches", async () => {
  const service = new KeelBackendService({ roots: ["extensions/js"] });

  try {
    const first = await service.search("warm", { limit: 1 });
    const firstHealth = await service.health();
    const second = await service.search("pool", { limit: 1 });
    const secondHealth = await service.health();

    assert.equal(first.items[0].title, "Hello from Keel: warm");
    assert.equal(second.items[0].title, "Hello from Keel: pool");
    assert.equal(first.extensions[0].id, "hello-world-js");
    assert.equal(firstHealth.extensions[0].running, true);
    assert.equal(firstHealth.extensions[0].pid, secondHealth.extensions[0].pid);
  } finally {
    service.shutdown();
  }
});

test("backend service exposes health before and after warmup", async () => {
  const service = new KeelBackendService({ roots: ["extensions/js"] });

  try {
    const cold = await service.health();
    assert.equal(cold.extensions[0].warmed, false);
    assert.equal(cold.extensions[0].running, false);

    const warm = await service.warm({ capability: "search" });
    const hot = await service.health();

    assert.equal(warm[0].ready, true);
    assert.equal(hot.extensions[0].warmed, true);
    assert.equal(hot.extensions[0].running, true);
  } finally {
    service.shutdown();
  }
});

test("backend service routes commands and reports missing extension ids", async () => {
  const service = new KeelBackendService({ roots: ["extensions/js"] });

  try {
    const result = await service.runCommand("demo.copy", {
      extensionId: "hello-world-js"
    });

    assert.equal(result.responses[0].result.ok, true);
    assert.equal(result.responses[0].result.toast.title, "Command completed");
    await assert.rejects(
      service.search("missing", { extensionId: "missing" }),
      /Extension is not available/
    );
  } finally {
    service.shutdown();
  }
});
