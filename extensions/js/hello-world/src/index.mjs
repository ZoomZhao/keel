import {
  createAction,
  createActionPanel,
  serve,
  showToast
} from "../../../../packages/js-extension-sdk/src/index.mjs";

serve({
  "extension.initialize": async ({ extension }) => ({
    ready: true,
    message: `${extension.name} is ready`
  }),

  "search.query": async ({ query, limit = 5 }) => ({
    items: [
      {
        id: "hello",
        title: `Hello from Keel: ${query}`,
        subtitle: "JavaScript extension response",
        score: 1,
        actions: createActionPanel([
          createAction({ id: "copy", title: "Copy Result", shortcut: "cmd+c" }),
          createAction({ id: "open", title: "Open Detail" })
        ]).actions
      },
      {
        id: "rust-path",
        title: "Rust extensions use the same protocol",
        subtitle: "Swap entry.kind to rust or process",
        score: 0.8
      }
    ].slice(0, limit)
  }),

  "command.run": async ({ commandId }) => ({
    ok: true,
    message: `Command ${commandId} completed`,
    toast: showToast({
      title: "Command completed",
      message: commandId
    })
  })
});
