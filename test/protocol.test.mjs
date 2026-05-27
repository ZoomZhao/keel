import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { generate } from "../tools/generate-protocol.mjs";

test("generated protocol bindings are current", async () => {
  const generated = await generate();
  const ts = await readFile("packages/protocol/src/generated.ts", "utf8");
  const rs = await readFile("crates/keel-protocol/src/generated.rs", "utf8");

  assert.equal(ts, generated.ts);
  assert.equal(rs, generated.rs);
});

test("schema declares core extension methods", async () => {
  const schema = JSON.parse(await readFile("protocol/keel.schema.json", "utf8"));
  const methods = schema.methods.map((method) => method.name);

  assert.deepEqual(methods, [
    "extension.initialize",
    "search.query",
    "command.run",
    "host.invoke"
  ]);
});
