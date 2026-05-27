import { discoverExtensions, ExtensionProcess } from "../../../packages/runtime/src/index.mjs";

const defaultRoots = ["extensions/js"];
const capabilityByMethod = new Map([
  ["search.query", "search"],
  ["command.run", "commands"]
]);

export class KeelBackendService {
  constructor({
    roots = defaultRoots,
    hostVersion = "0.1.0",
    processFactory = (manifest) => new ExtensionProcess(manifest)
  } = {}) {
    this.roots = roots;
    this.hostVersion = hostVersion;
    this.processFactory = processFactory;
    this.manifests = [];
    this.extensions = new Map();
    this.loaded = false;
  }

  async load() {
    if (this.loaded) return this.manifests;
    this.manifests = await discoverExtensions(this.roots);
    this.loaded = true;
    return this.manifests;
  }

  async warm({ capability } = {}) {
    const manifests = await this.load();
    const targets = capability
      ? manifests.filter((manifest) => manifest.capabilities.includes(capability))
      : manifests;

    const results = await Promise.allSettled(
      targets.map(async (manifest) => {
        const extension = await this.ensureInitialized(manifest.id);
        return {
          id: manifest.id,
          ready: true,
          pid: extension.child?.pid ?? null
        };
      })
    );

    return results.map((result, index) => {
      const manifest = targets[index];
      if (result.status === "fulfilled") return result.value;
      return {
        id: manifest.id,
        ready: false,
        error: result.reason?.message ?? String(result.reason)
      };
    });
  }

  async search(query = "keel", { limit = 5, extensionId } = {}) {
    const result = await this.route("search.query", { query, limit }, { extensionId });
    return {
      query,
      items: result.responses.flatMap((response) => (
        response.result.items.map((item) => ({
          ...item,
          extensionId: response.extension.id
        }))
      )),
      extensions: result.responses.map((response) => ({
        id: response.extension.id,
        name: response.extension.name,
        status: "ok",
        itemCount: response.result.items.length
      })),
      errors: result.errors
    };
  }

  async runCommand(commandId, { arguments: commandArguments, extensionId } = {}) {
    const result = await this.route(
      "command.run",
      { commandId, arguments: commandArguments },
      { extensionId }
    );
    return {
      commandId,
      responses: result.responses.map((response) => ({
        extensionId: response.extension.id,
        result: response.result
      })),
      errors: result.errors
    };
  }

  async route(method, params, { extensionId } = {}) {
    const manifests = await this.load();
    const capability = capabilityByMethod.get(method);
    const targets = manifests.filter((manifest) => {
      if (extensionId && manifest.id !== extensionId) return false;
      return !capability || manifest.capabilities.includes(capability);
    });

    if (extensionId && targets.length === 0) {
      throw new Error(`Extension is not available for ${method}: ${extensionId}`);
    }

    const settled = await Promise.allSettled(
      targets.map(async (manifest) => {
        const extension = await this.ensureInitialized(manifest.id);
        const result = await extension.request(method, params);
        return { extension: manifest, result };
      })
    );

    const responses = [];
    const errors = [];
    settled.forEach((result, index) => {
      if (result.status === "fulfilled") {
        responses.push(result.value);
      } else {
        errors.push({
          extensionId: targets[index].id,
          message: result.reason?.message ?? String(result.reason)
        });
      }
    });

    return { method, responses, errors };
  }

  async health() {
    const manifests = await this.load();
    return {
      status: "ok",
      roots: this.roots,
      service: "KeelBackendService",
      features: [
        "Long-lived extension processes",
        "Capability-based routing",
        "Health checks"
      ],
      extensions: manifests.map((manifest) => {
        const process = this.extensions.get(manifest.id);
        return {
          id: manifest.id,
          name: manifest.name,
          kind: manifest.entry.kind,
          capabilities: manifest.capabilities,
          warmed: Boolean(process?.initialized),
          running: Boolean(process?.extension.child),
          pid: process?.extension.child?.pid ?? null,
          pending: process?.extension.pending?.size ?? 0
        };
      })
    };
  }

  async ensureInitialized(extensionId) {
    const manifests = await this.load();
    const manifest = manifests.find((candidate) => candidate.id === extensionId);
    if (!manifest) throw new Error(`Unknown extension: ${extensionId}`);

    let record = this.extensions.get(extensionId);
    if (!record || !record.extension.child) {
      record = {
        extension: this.processFactory(manifest),
        initialized: false,
        initializePromise: null
      };
      this.extensions.set(extensionId, record);
    }

    if (!record.initialized) {
      record.initializePromise ??= record.extension.initialize(this.hostVersion);
      await record.initializePromise;
      record.initialized = true;
    }

    return record.extension;
  }

  shutdown() {
    for (const record of this.extensions.values()) {
      record.extension.stop();
    }
    this.extensions.clear();
  }
}

let sharedService;

export function getSharedBackendService(options) {
  sharedService ??= new KeelBackendService(options);
  return sharedService;
}

export function resetSharedBackendService() {
  sharedService?.shutdown();
  sharedService = undefined;
}
