import { ExtensionProcess, validateManifest } from "../../../packages/runtime/src/index.mjs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function loadManifest(extensionDir) {
  const dir = resolve(extensionDir);
  const manifest = JSON.parse(await readFile(resolve(dir, "manifest.json"), "utf8"));
  return validateManifest(manifest, dir);
}

export async function runBackend({ extensionDir, query = "hello" }) {
  const manifest = await loadManifest(extensionDir);
  const extension = new ExtensionProcess(manifest);

  try {
    const init = await extension.initialize();
    const search = await extension.request("search.query", { query, limit: 5 });
    return { extension: manifest.id, init, search };
  } finally {
    extension.stop();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const extensionArgIndex = process.argv.indexOf("--extension");
  const extensionDir = extensionArgIndex === -1
    ? "extensions/js/hello-world"
    : process.argv[extensionArgIndex + 1];

  const result = await runBackend({ extensionDir });
  console.log(JSON.stringify(result, null, 2));
}

