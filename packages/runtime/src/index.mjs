import { createInterface } from "node:readline";
import { readdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";

export async function discoverExtensions(roots) {
  const manifests = [];

  for (const root of roots) {
    const rootPath = resolve(root);
    const entries = await readdir(rootPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const dir = join(rootPath, entry.name);
      const manifestPath = join(dir, "manifest.json");
      try {
        const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
        manifests.push(validateManifest(manifest, dir));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
  }

  return manifests;
}

export function validateManifest(manifest, dir) {
  for (const key of ["id", "name", "version", "entry", "capabilities"]) {
    if (!(key in manifest)) throw new Error(`Extension manifest is missing ${key}`);
  }
  if (!["node", "rust", "process"].includes(manifest.entry.kind)) {
    throw new Error(`Unsupported extension kind: ${manifest.entry.kind}`);
  }
  return { ...manifest, dir };
}

export class ExtensionProcess {
  constructor(manifest) {
    this.manifest = manifest;
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
  }

  start() {
    if (this.child) return;
    const { command, args = [] } = this.manifest.entry;
    this.child = spawn(command, args, {
      cwd: this.manifest.dir,
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.once("exit", (code, signal) => {
      for (const pending of this.pending.values()) {
        pending.reject(new Error(`Extension exited before response: code=${code} signal=${signal}`));
      }
      this.pending.clear();
      this.child = null;
    });

    createInterface({ input: this.child.stdout }).on("line", (line) => {
      this.handleLine(line);
    });

    this.child.stderr.on("data", (chunk) => {
      process.stderr.write(`[${this.manifest.id}] ${chunk}`);
    });
  }

  async initialize(hostVersion = "0.1.0") {
    return this.request("extension.initialize", {
      hostVersion,
      extension: {
        id: this.manifest.id,
        name: this.manifest.name,
        version: this.manifest.version,
        capabilities: this.manifest.capabilities
      }
    });
  }

  request(method, params) {
    this.start();
    const id = String(this.nextId++);
    const payload = JSON.stringify({ id, method, params });

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(`${payload}\n`, (error) => {
        if (!error) return;
        this.pending.delete(id);
        reject(error);
      });
    });
  }

  handleLine(line) {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      process.stderr.write(`[${this.manifest.id}] invalid json: ${line}\n`);
      return;
    }

    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(`${message.error.code}: ${message.error.message}`));
    } else {
      pending.resolve(message.result);
    }
  }

  stop() {
    if (!this.child) return;
    this.child.kill();
    this.child = null;
  }
}

