let nextMessageId = 1;

export const nativeBridgeMethods = {
  HOST_READY: "host.ready",
  WINDOW_SHOW: "window.show",
  WINDOW_HIDE: "window.hide",
  WINDOW_FOCUS: "window.focus",
  TOAST_SHOW: "toast.show",
  CLIPBOARD_READ_TEXT: "clipboard.readText",
  CLIPBOARD_WRITE_TEXT: "clipboard.writeText",
  GLOBAL_HOTKEY_REGISTER: "globalHotkey.register"
};

export function createNativeBridge({ transport, idFactory = createMessageId } = {}) {
  const resolvedTransport = transport ?? detectBrowserNativeTransport();

  function invoke(method, params = {}) {
    const message = {
      id: idFactory(),
      method,
      params
    };
    const result = resolvedTransport.send(message);
    return Promise.resolve(result).then((value) => value ?? { ok: true });
  }

  return {
    invoke,
    ready(params = {}) {
      return invoke(nativeBridgeMethods.HOST_READY, params);
    },
    focusWindow(params = {}) {
      return invoke(nativeBridgeMethods.WINDOW_FOCUS, params);
    },
    hideWindow(params = {}) {
      return invoke(nativeBridgeMethods.WINDOW_HIDE, params);
    },
    showToast(params) {
      return invoke(nativeBridgeMethods.TOAST_SHOW, params);
    },
    writeClipboardText(text) {
      return invoke(nativeBridgeMethods.CLIPBOARD_WRITE_TEXT, { text });
    },
    readClipboardText() {
      return invoke(nativeBridgeMethods.CLIPBOARD_READ_TEXT);
    },
    registerGlobalHotkey(params) {
      return invoke(nativeBridgeMethods.GLOBAL_HOTKEY_REGISTER, params);
    }
  };
}

export function createBrowserNativeBridge(globalObject = globalThis) {
  return createNativeBridge({
    transport: detectBrowserNativeTransport(globalObject)
  });
}

export function detectBrowserNativeTransport(globalObject = globalThis) {
  const webkitHandler = globalObject.window?.webkit?.messageHandlers?.keelHost;
  if (webkitHandler?.postMessage) {
    return {
      platform: "macos",
      send(message) {
        webkitHandler.postMessage(message);
      }
    };
  }

  const webView = globalObject.window?.chrome?.webview;
  if (webView?.postMessage) {
    return {
      platform: "windows",
      send(message) {
        webView.postMessage(message);
      }
    };
  }

  return {
    platform: "web",
    send() {
      return {
        ok: false,
        reason: "native_transport_unavailable"
      };
    }
  };
}

export function createMessageId() {
  return `native-${nextMessageId++}`;
}
