import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const allowedWindowKinds = new Set(["launcher", "panel", "settings", "utility"]);

export async function loadWebViewConfig(path = "apps/desktop-host/webview.config.json") {
  const config = JSON.parse(await readFile(resolve(path), "utf8"));
  return validateWebViewConfig(config);
}

export function validateWebViewConfig(config) {
  assertObject(config, "config");
  assertString(config.name, "name");
  assertString(config.version, "version");
  assertObject(config.frontend, "frontend");
  assertString(config.frontend.devUrl, "frontend.devUrl");
  assertString(config.frontend.distDir, "frontend.distDir");
  assertArray(config.windows, "windows");

  const ids = new Set();
  for (const [index, windowConfig] of config.windows.entries()) {
    const path = `windows[${index}]`;
    assertObject(windowConfig, path);
    assertString(windowConfig.id, `${path}.id`);
    assertString(windowConfig.title, `${path}.title`);
    assertString(windowConfig.kind, `${path}.kind`);
    if (!allowedWindowKinds.has(windowConfig.kind)) {
      throw new Error(`${path}.kind must be one of ${[...allowedWindowKinds].join(", ")}`);
    }
    if (ids.has(windowConfig.id)) {
      throw new Error(`Duplicate window id: ${windowConfig.id}`);
    }
    ids.add(windowConfig.id);
    validateSize(windowConfig.size, `${path}.size`);
    if (windowConfig.route !== undefined) assertString(windowConfig.route, `${path}.route`);
  }

  validatePlatform(config.platform?.macos, "platform.macos", ["webKit", "window"]);
  validatePlatform(config.platform?.windows, "platform.windows", ["webView2", "window"]);

  return config;
}

function validateSize(size, path) {
  assertObject(size, path);
  for (const key of ["width", "height", "minWidth", "minHeight"]) {
    if (size[key] !== undefined && (!Number.isInteger(size[key]) || size[key] <= 0)) {
      throw new Error(`${path}.${key} must be a positive integer`);
    }
  }
}

function validatePlatform(platform, path, objectKeys) {
  if (platform === undefined) return;
  assertObject(platform, path);
  for (const key of objectKeys) {
    if (platform[key] !== undefined) assertObject(platform[key], `${path}.${key}`);
  }
}

function assertObject(value, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path} must be an object`);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
}

function assertString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${path} must be a non-empty string`);
  }
}

