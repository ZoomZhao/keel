import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserNativeBridge,
  createNativeBridge,
  detectBrowserNativeTransport,
  nativeBridgeMethods
} from "../packages/native-bridge/src/index.mjs";

test("native bridge sends typed envelopes through an injected transport", async () => {
  const messages = [];
  const bridge = createNativeBridge({
    idFactory: () => "fixed-id",
    transport: {
      send(message) {
        messages.push(message);
        return { ok: true };
      }
    }
  });

  const result = await bridge.showToast({ title: "Ready" });

  assert.deepEqual(result, { ok: true });
  assert.deepEqual(messages, [{
    id: "fixed-id",
    method: nativeBridgeMethods.TOAST_SHOW,
    params: { title: "Ready" }
  }]);
});

test("browser native bridge detects macOS and Windows transports", async () => {
  const macMessages = [];
  const mac = {
    window: {
      webkit: {
        messageHandlers: {
          keelHost: {
            postMessage(message) {
              macMessages.push(message);
            }
          }
        }
      }
    }
  };

  const winMessages = [];
  const win = {
    window: {
      chrome: {
        webview: {
          postMessage(message) {
            winMessages.push(message);
          }
        }
      }
    }
  };

  assert.equal(detectBrowserNativeTransport(mac).platform, "macos");
  assert.equal(detectBrowserNativeTransport(win).platform, "windows");

  await createBrowserNativeBridge(mac).ready({ surface: "launcher" });
  await createBrowserNativeBridge(win).focusWindow();

  assert.equal(macMessages[0].method, "host.ready");
  assert.equal(winMessages[0].method, "window.focus");
});

test("browser native bridge has a non-native fallback", async () => {
  const bridge = createBrowserNativeBridge({ window: {} });

  assert.deepEqual(await bridge.hideWindow(), {
    ok: false,
    reason: "native_transport_unavailable"
  });
});
