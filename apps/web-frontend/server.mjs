import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { getSharedBackendService } from "../node-backend/src/main.mjs";
import { loadWebViewConfig } from "../../packages/host-config/src/index.mjs";
import { discoverExtensions } from "../../packages/runtime/src/index.mjs";

const appDir = resolve(fileURLToPath(new URL(".", import.meta.url)));
const rootDir = resolve(appDir, "../..");
const defaultPort = Number.parseInt(process.env.PORT ?? "5173", 10);

const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml"
};

export async function createUiServer({ useVite = false } = {}) {
  const vite = useVite ? await createViteMiddleware() : null;

  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");

      if (url.pathname === "/api/overview") {
        return json(response, await getOverview());
      }

      if (url.pathname === "/api/config") {
        return json(response, await loadWebViewConfig());
      }

      if (url.pathname === "/api/search") {
        const query = url.searchParams.get("q") || "keel";
        return json(response, await runUiSearch(query));
      }

      if (vite) {
        vite.middlewares(request, response, (error) => {
          if (error) {
            vite.ssrFixStacktrace(error);
            json(response, {
              error: {
                code: "vite_middleware_error",
                message: error.message ?? String(error)
              }
            }, 500);
          }
        });
        return;
      }

      return serveStatic(url.pathname, response);
    } catch (error) {
      json(response, {
        error: {
          code: "ui_server_error",
          message: error.message ?? String(error)
        }
      }, 500);
    }
  });
}

export async function getOverview() {
  const backend = getSharedBackendService();
  const [webViewConfig, protocol, jsExtensions, rustExtensions, optionalRustExtensions] = await Promise.all([
    loadWebViewConfig(),
    readProtocolSchema(),
    discoverExtensions(["extensions/js"]),
    discoverExtensions(["extensions/rust"]),
    discoverExtensions(["extensions/rust"], { includeDisabled: true })
  ]);
  const optionalExtensions = optionalRustExtensions.filter((manifest) => (
    manifest.enabled === false || manifest.optional === true
  ));

  const extensions = [...jsExtensions, ...rustExtensions].map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    kind: manifest.entry.kind,
    command: [manifest.entry.command, ...(manifest.entry.args ?? [])].join(" "),
    capabilities: manifest.capabilities
  }));

  return {
    project: {
      name: "Keel",
      version: protocol.version,
      license: "Apache-2.0"
    },
    extensions,
    optionalExtensions: optionalExtensions.map((manifest) => ({
      id: manifest.id,
      name: manifest.name,
      version: manifest.version,
      kind: manifest.entry.kind,
      command: [manifest.entry.command, ...(manifest.entry.args ?? [])].join(" "),
      capabilities: manifest.capabilities,
      enabled: manifest.enabled ?? true,
      optional: manifest.optional ?? false
    })),
    webView: {
      windows: webViewConfig.windows,
      frontend: webViewConfig.frontend,
      macos: webViewConfig.platform?.macos,
      platformWindows: webViewConfig.platform?.windows,
      lifecycle: webViewConfig.lifecycle
    },
    backend: await backend.health(),
    protocol: {
      records: protocol.records.map((record) => record.name),
      methods: protocol.methods
    },
    rust: {
      crates: [
        "keel-capabilities",
        "keel-extension-sdk",
        "keel-protocol"
      ],
      capabilities: [
        "CapabilityRegistry",
        "InMemorySearchIndex",
        "JSON Lines extension SDK"
      ]
    }
  };
}

export async function runUiSearch(query = "keel") {
  const backend = getSharedBackendService();
  const search = await backend.search(query, { limit: 5 });
  return {
    extension: search.extensions[0]?.id ?? "none",
    search
  };
}

async function readProtocolSchema() {
  return JSON.parse(await readFile(resolve(rootDir, "protocol/keel.schema.json"), "utf8"));
}

async function createViteMiddleware() {
  const { createServer: createViteServer } = await import("vite");
  return createViteServer({
    root: appDir,
    server: { middlewareMode: true },
    appType: "spa"
  });
}

async function serveStatic(pathname, response) {
  const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = resolve(appDir, relativePath);

  if (!filePath.startsWith(appDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": mimeTypes[extname(filePath)] ?? "application/octet-stream"
    });
    response.end(content);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const fallback = await readFile(join(appDir, "index.html"));
    response.writeHead(200, { "Content-Type": mimeTypes[".html"] });
    response.end(fallback);
  }
}

function json(response, body, status = 200) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

export function startUiServer({ port = defaultPort } = {}) {
  return createUiServer({ useVite: true }).then((server) => {
    server.on("error", (error) => {
      if (error.code !== "EADDRINUSE") throw error;
      server.close();
      startUiServer({ port: port + 1 });
    });

    server.listen(port, () => {
      const address = server.address();
      const actualPort = typeof address === "object" && address ? address.port : port;
      console.log(`Keel UI listening on http://localhost:${actualPort}`);
    });

    return server;
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startUiServer();
}
