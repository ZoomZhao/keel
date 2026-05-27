import { runBackend } from "../../node-backend/src/main.mjs";
import { loadWebViewConfig } from "../../../packages/host-config/src/index.mjs";

const webViewConfig = await loadWebViewConfig();

const result = await runBackend({
  extensionDir: "extensions/js/hello-world",
  query: "keel"
});

console.log("Keel demo host");
console.log(`Loaded ${webViewConfig.windows.length} WebView window configs.`);
console.log(JSON.stringify(result, null, 2));

