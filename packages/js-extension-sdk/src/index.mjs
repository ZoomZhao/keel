import { createInterface } from "node:readline";

export function createAction({ id, title, style = "default", shortcut } = {}) {
  if (!id || !title) throw new Error("Action requires id and title");
  return removeUndefined({ id, title, style, shortcut });
}

export function createActionPanel(actions = []) {
  if (!Array.isArray(actions)) throw new Error("ActionPanel actions must be an array");
  return { actions };
}

export function showToast({ title, message, style = "success" } = {}) {
  if (!title) throw new Error("Toast requires title");
  return removeUndefined({ title, message, style });
}

export function createMemoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));

  return {
    async get(key) {
      return data.get(key);
    },
    async set(key, value) {
      data.set(key, value);
    },
    async remove(key) {
      data.delete(key);
    },
    async clear() {
      data.clear();
    },
    async entries() {
      return Object.fromEntries(data.entries());
    }
  };
}

export function serve(handlers) {
  const input = createInterface({ input: process.stdin });

  input.on("line", async (line) => {
    let request;
    try {
      request = JSON.parse(line);
      const handler = handlers[request.method];
      if (!handler) {
        throw Object.assign(new Error(`Unsupported method: ${request.method}`), {
          code: "method_not_found"
        });
      }
      const result = await handler(request.params);
      write({ id: request.id, result });
    } catch (error) {
      write({
        id: request?.id ?? "unknown",
        error: {
          code: error.code ?? "extension_error",
          message: error.message ?? String(error)
        }
      });
    }
  });
}

function write(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function removeUndefined(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, fieldValue]) => fieldValue !== undefined)
  );
}
