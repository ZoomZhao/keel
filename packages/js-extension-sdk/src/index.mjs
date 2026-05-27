import { createInterface } from "node:readline";

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

