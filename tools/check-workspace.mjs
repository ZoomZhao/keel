import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { generate } from "./generate-protocol.mjs";

const requiredFiles = [
  "README.md",
  "ARCHITECTURE.md",
  "LICENSE",
  "package.json",
  "protocol/keel.schema.json",
  "packages/protocol/src/generated.ts",
  "packages/host-config/src/index.mjs",
  "apps/desktop-host/webview.config.json",
  "crates/keel-capabilities/src/lib.rs",
  "crates/keel-protocol/src/generated.rs",
  "extensions/js/hello-world/manifest.json",
  "extensions/rust/hello-world/manifest.json"
];

for (const file of requiredFiles) {
  await access(resolve(file));
}

const generated = await generate();
const currentTs = await readFile("packages/protocol/src/generated.ts", "utf8");
const currentRs = await readFile("crates/keel-protocol/src/generated.rs", "utf8");

if (currentTs !== generated.ts || currentRs !== generated.rs) {
  console.error("Generated protocol bindings are stale. Run npm run gen.");
  process.exit(1);
}

const manifests = [
  "extensions/js/hello-world/manifest.json",
  "extensions/rust/hello-world/manifest.json"
];

for (const manifestPath of manifests) {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  for (const key of ["id", "name", "version", "entry", "capabilities"]) {
    if (!(key in manifest)) {
      console.error(`${manifestPath} is missing ${key}`);
      process.exit(1);
    }
  }
}

console.log("Workspace check passed.");
