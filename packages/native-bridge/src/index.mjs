let nextMessageId = 1;

export const nativeBridgeMethods = {
  HOST_READY: "host.ready",
  WINDOW_SHOW: "window.show",
  WINDOW_HIDE: "window.hide",
  WINDOW_FOCUS: "window.focus",
  TOAST_SHOW: "toast.show",
  TOAST_HIDE: "toast.hide",
  CLIPBOARD_READ_TEXT: "clipboard.readText",
  CLIPBOARD_WRITE_TEXT: "clipboard.writeText",
  GLOBAL_HOTKEY_REGISTER: "globalHotkey.register",
  POPOVER_SHOW: "popover.show",
  POPOVER_HIDE: "popover.hide",
  TOOLTIP_SHOW: "tooltip.show",
  TOOLTIP_HIDE: "tooltip.hide"
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
    hideToast(params = {}) {
      return invoke(nativeBridgeMethods.TOAST_HIDE, params);
    },
    writeClipboardText(text) {
      return invoke(nativeBridgeMethods.CLIPBOARD_WRITE_TEXT, { text });
    },
    readClipboardText() {
      return invoke(nativeBridgeMethods.CLIPBOARD_READ_TEXT);
    },
    registerGlobalHotkey(params) {
      return invoke(nativeBridgeMethods.GLOBAL_HOTKEY_REGISTER, params);
    },
    showPopover(params) {
      return invoke(nativeBridgeMethods.POPOVER_SHOW, params);
    },
    hidePopover(params = {}) {
      return invoke(nativeBridgeMethods.POPOVER_HIDE, params);
    },
    showTooltip(params) {
      return invoke(nativeBridgeMethods.TOOLTIP_SHOW, params);
    },
    hideTooltip(params = {}) {
      return invoke(nativeBridgeMethods.TOOLTIP_HIDE, params);
    },
    onNativeEvent(handler) {
      if (!resolvedTransport.onEvent) return () => {};
      return resolvedTransport.onEvent(handler);
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
      },
      onEvent(handler) {
        return listenToDomNativeEvents(globalObject.window, handler);
      }
    };
  }

  const webView = globalObject.window?.chrome?.webview;
  if (webView?.postMessage) {
    return {
      platform: "windows",
      send(message) {
        webView.postMessage(message);
      },
      onEvent(handler) {
        const removeDomListener = listenToDomNativeEvents(globalObject.window, handler);
        const handleWebViewMessage = (event) => {
          if (event?.data?.source === "keelHost") handler(event.data);
        };
        webView.addEventListener?.("message", handleWebViewMessage);
        return () => {
          removeDomListener();
          webView.removeEventListener?.("message", handleWebViewMessage);
        };
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

function listenToDomNativeEvents(windowObject, handler) {
  if (!windowObject?.addEventListener) return () => {};
  const listener = (event) => {
    if (event?.detail?.source === "keelHost") handler(event.detail);
  };
  windowObject.addEventListener("keel:native-event", listener);
  return () => windowObject.removeEventListener?.("keel:native-event", listener);
}
