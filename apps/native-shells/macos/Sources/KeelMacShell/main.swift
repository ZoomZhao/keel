import AppKit
import Foundation
import WebKit

struct HostConfig: Decodable {
    let name: String
    let frontend: FrontendConfig
    let windows: [WindowConfig]
    let platform: PlatformConfig?
}

struct FrontendConfig: Decodable {
    let devUrl: String
    let distDir: String
}

struct WindowConfig: Decodable {
    let id: String
    let title: String
    let kind: String
    let route: String?
    let size: WindowSize
    let transparent: Bool?
    let alwaysOnTop: Bool?
    let hideFromTaskSwitcher: Bool?
    let closeBehavior: String?
}

struct WindowSize: Decodable {
    let width: Int
    let height: Int
    let minWidth: Int?
    let minHeight: Int?
}

struct PlatformConfig: Decodable {
    let macos: MacOSConfig?
}

struct MacOSConfig: Decodable {
    let webKit: WebKitConfig?
    let window: MacWindowConfig?
}

struct WebKitConfig: Decodable {
    let allowsBackForwardNavigationGestures: Bool?
    let drawsTransparentBackground: Bool?
    let disableWindowOcclusionDetection: Bool?
    let prewarmBeforeShow: Bool?
    let renderBeyondVisibleBounds: Bool?
}

struct MacWindowConfig: Decodable {
    let activationPolicy: String?
    let material: String?
    let level: String?
    let nativeTooltips: Bool?
    let nativePopovers: Bool?
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate {
    private var window: NSWindow?
    private let bridge = HostBridge()

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = loadHostConfig()
        let launcher = config.windows.first { $0.kind == "launcher" } ?? config.windows[0]
        let webView = makeWebView(config: config)
        let window = makeWindow(config: config, launcher: launcher, webView: webView)
        self.window = window
        bridge.window = window
        bridge.webView = webView
        bridge.hostConfig = config
        window.delegate = self

        if config.platform?.macos?.window?.activationPolicy == "accessory" {
            NSApp.setActivationPolicy(.accessory)
        }

        if config.platform?.macos?.webKit?.prewarmBeforeShow == true {
            window.alphaValue = 0
            window.orderOut(nil)
        } else {
            showLauncherWindow(window)
        }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }

    private func makeWebView(config: HostConfig) -> WKWebView {
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true

        let webConfig = WKWebViewConfiguration()
        webConfig.defaultWebpagePreferences = preferences
        webConfig.userContentController.add(bridge, name: "keelHost")

        let webView = WKWebView(frame: .zero, configuration: webConfig)
        webView.allowsBackForwardNavigationGestures =
            config.platform?.macos?.webKit?.allowsBackForwardNavigationGestures ?? false
        webView.setValue(
            config.platform?.macos?.webKit?.drawsTransparentBackground ?? true,
            forKey: "drawsTransparentBackground"
        )

        let route = config.windows.first { $0.kind == "launcher" }?.route ?? "/"
        let url = URL(string: config.frontend.devUrl + route)!
        webView.load(URLRequest(url: url))
        return webView
    }

    private func makeWindow(config: HostConfig, launcher: WindowConfig, webView: WKWebView) -> NSWindow {
        let size = launcher.size
        let rect = NSRect(x: 0, y: 0, width: size.width, height: size.height)
        let window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .fullSizeContentView, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = launcher.title
        window.center()
        window.contentView = webView
        window.titlebarAppearsTransparent = launcher.transparent ?? true
        window.isOpaque = !(launcher.transparent ?? true)
        window.backgroundColor = (launcher.transparent ?? true) ? .clear : .windowBackgroundColor
        window.minSize = NSSize(width: size.minWidth ?? 520, height: size.minHeight ?? 360)
        window.isReleasedWhenClosed = false

        if launcher.alwaysOnTop == true || config.platform?.macos?.window?.level == "floating" {
            window.level = .floating
        }

        if config.platform?.macos?.window?.material != nil {
            let visualEffect = NSVisualEffectView(frame: window.contentView?.bounds ?? rect)
            visualEffect.autoresizingMask = [.width, .height]
            visualEffect.material = .hudWindow
            visualEffect.blendingMode = .behindWindow
            webView.addSubview(visualEffect, positioned: .below, relativeTo: nil)
        }

        return window
    }

    private func showLauncherWindow(_ window: NSWindow) {
        window.alphaValue = 1
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }
}

final class HostBridge: NSObject, WKScriptMessageHandler {
    weak var window: NSWindow?
    weak var webView: WKWebView?
    var hostConfig: HostConfig?
    private lazy var hotkeys = HotkeyRegistry(bridge: self)
    private let panels = FloatingPanelPresenter()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any],
              let method = body["method"] as? String else {
            return
        }

        let params = body["params"] as? [String: Any] ?? [:]
        DispatchQueue.main.async {
            self.handle(method: method, params: params)
        }
    }

    private func handle(method: String, params: [String: Any]) {
        switch method {
        case "host.ready", "window.show", "window.focus":
            showWindow()
        case "window.hide":
            window?.orderOut(nil)
        case "toast.show":
            let title = params["title"] as? String ?? "Keel"
            let message = params["message"] as? String ?? ""
            NSLog("[Keel toast] %@ %@", title, message)
        case "clipboard.writeText":
            if let text = params["text"] as? String {
                NSPasteboard.general.clearContents()
                NSPasteboard.general.setString(text, forType: .string)
            }
        case "clipboard.readText":
            emitNativeEvent(method: "clipboard.readText.result", payload: [
                "text": NSPasteboard.general.string(forType: .string) ?? ""
            ])
        case "globalHotkey.register":
            hotkeys.register(params: params)
        case "popover.show":
            guard hostConfig?.platform?.macos?.window?.nativePopovers != false else { return }
            panels.showPopover(params: params, relativeTo: window)
        case "popover.hide":
            panels.hidePopover(id: params["id"] as? String)
        case "tooltip.show":
            guard hostConfig?.platform?.macos?.window?.nativeTooltips != false else { return }
            panels.showTooltip(params: params, relativeTo: window)
        case "tooltip.hide":
            panels.hideTooltip(id: params["id"] as? String)
        default:
            NSLog("[Keel bridge] Unsupported method: %@", method)
        }
    }

    func showWindow() {
        window?.alphaValue = 1
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func emitNativeEvent(method: String, payload: [String: Any]) {
        let body: [String: Any] = [
            "source": "keelHost",
            "method": method,
            "payload": payload
        ]
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let json = String(data: data, encoding: .utf8) else {
            return
        }

        webView?.evaluateJavaScript(
            "window.dispatchEvent(new CustomEvent('keel:native-event', { detail: \(json) }))"
        )
    }
}

struct HotkeyRegistration {
    let id: String
    let action: String?
    let key: String
    let modifiers: NSEvent.ModifierFlags
}

final class HotkeyRegistry {
    private weak var bridge: HostBridge?
    private var registrations: [String: HotkeyRegistration] = [:]
    private var localMonitor: Any?
    private var globalMonitor: Any?

    init(bridge: HostBridge) {
        self.bridge = bridge
    }

    func register(params: [String: Any]) {
        guard let id = params["id"] as? String,
              let accelerator = params["accelerator"] as? String,
              let registration = parse(id: id, accelerator: accelerator, action: params["action"] as? String) else {
            NSLog("[Keel hotkey] Invalid registration")
            return
        }

        registrations[id] = registration
        installMonitorsIfNeeded()
        NSLog("[Keel hotkey] Registered %@", accelerator)
    }

    private func installMonitorsIfNeeded() {
        if localMonitor == nil {
            localMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                self?.handle(event: event) == true ? nil : event
            }
        }
        if globalMonitor == nil {
            globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
                _ = self?.handle(event: event)
            }
        }
    }

    private func handle(event: NSEvent) -> Bool {
        for registration in registrations.values where matches(event: event, registration: registration) {
            if registration.action == "window.focus" {
                bridge?.showWindow()
            }
            bridge?.emitNativeEvent(method: "globalHotkey.pressed", payload: [
                "id": registration.id,
                "accelerator": acceleratorString(registration)
            ])
            return true
        }
        return false
    }

    private func matches(event: NSEvent, registration: HotkeyRegistration) -> Bool {
        let key = event.charactersIgnoringModifiers?.lowercased() ?? ""
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        return key == registration.key && flags.isSuperset(of: registration.modifiers)
    }

    private func parse(id: String, accelerator: String, action: String?) -> HotkeyRegistration? {
        let parts = accelerator.split(separator: "+").map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        guard let key = parts.last, !key.isEmpty else { return nil }
        var modifiers: NSEvent.ModifierFlags = []

        for modifier in parts.dropLast() {
            switch modifier {
            case "cmd", "command", "meta": modifiers.insert(.command)
            case "shift": modifiers.insert(.shift)
            case "option", "alt": modifiers.insert(.option)
            case "control", "ctrl": modifiers.insert(.control)
            default: break
            }
        }

        return HotkeyRegistration(id: id, action: action, key: key, modifiers: modifiers)
    }

    private func acceleratorString(_ registration: HotkeyRegistration) -> String {
        var parts: [String] = []
        if registration.modifiers.contains(.command) { parts.append("Command") }
        if registration.modifiers.contains(.shift) { parts.append("Shift") }
        if registration.modifiers.contains(.option) { parts.append("Option") }
        if registration.modifiers.contains(.control) { parts.append("Control") }
        parts.append(registration.key.uppercased())
        return parts.joined(separator: "+")
    }
}

final class FloatingPanelPresenter {
    private var panels: [String: NSPanel] = [:]

    func showPopover(params: [String: Any], relativeTo window: NSWindow?) {
        let id = params["id"] as? String ?? "popover"
        let title = params["title"] as? String ?? "Keel"
        let message = params["message"] as? String ?? ""
        showPanel(id: id, title: title, message: message, params: params, relativeTo: window, isTooltip: false)
    }

    func hidePopover(id: String?) {
        hide(id: id ?? "popover")
    }

    func showTooltip(params: [String: Any], relativeTo window: NSWindow?) {
        let id = params["id"] as? String ?? "tooltip"
        let text = params["text"] as? String ?? ""
        showPanel(id: id, title: text, message: "", params: params, relativeTo: window, isTooltip: true)
    }

    func hideTooltip(id: String?) {
        hide(id: id ?? "tooltip")
    }

    private func showPanel(
        id: String,
        title: String,
        message: String,
        params: [String: Any],
        relativeTo window: NSWindow?,
        isTooltip: Bool
    ) {
        hide(id: id)
        let width: CGFloat = isTooltip ? 180 : 260
        let height: CGFloat = isTooltip ? 38 : 86
        let panel = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: width, height: height),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = true

        let container = NSVisualEffectView(frame: NSRect(x: 0, y: 0, width: width, height: height))
        container.autoresizingMask = [.width, .height]
        container.material = .hudWindow
        container.blendingMode = .behindWindow
        container.state = .active

        let stack = NSStackView(frame: NSRect(x: 14, y: 10, width: width - 28, height: height - 20))
        stack.orientation = .vertical
        stack.spacing = 3
        stack.alignment = .leading
        stack.addArrangedSubview(label(title, font: .systemFont(ofSize: isTooltip ? 12 : 13, weight: .semibold)))
        if !message.isEmpty {
            stack.addArrangedSubview(label(message, font: .systemFont(ofSize: 12, weight: .regular)))
        }
        container.addSubview(stack)
        panel.contentView = container

        panel.setFrameOrigin(origin(params: params, relativeTo: window, panelSize: panel.frame.size))
        panel.orderFrontRegardless()
        panels[id] = panel

        if isTooltip {
            DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) { [weak self] in
                self?.hide(id: id)
            }
        }
    }

    private func hide(id: String) {
        panels[id]?.orderOut(nil)
        panels[id] = nil
    }

    private func label(_ text: String, font: NSFont) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = font
        field.textColor = .labelColor
        field.lineBreakMode = .byTruncatingTail
        return field
    }

    private func origin(params: [String: Any], relativeTo window: NSWindow?, panelSize: NSSize) -> NSPoint {
        guard let anchor = params["anchorRect"] as? [String: Any],
              let window = window else {
            return NSPoint(x: 120, y: 120)
        }

        let x = anchor["x"] as? CGFloat ?? 0
        let y = anchor["y"] as? CGFloat ?? 0
        let height = anchor["height"] as? CGFloat ?? 0
        let localPoint = NSPoint(x: x, y: y + height + 8)
        let screenPoint = window.convertPoint(toScreen: localPoint)
        return NSPoint(x: screenPoint.x, y: screenPoint.y - panelSize.height)
    }
}

func loadHostConfig() -> HostConfig {
    let currentDirectory = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
    let candidates = [
        currentDirectory.appendingPathComponent("apps/desktop-host/webview.config.json"),
        currentDirectory.appendingPathComponent("../desktop-host/webview.config.json"),
        currentDirectory.appendingPathComponent("../../desktop-host/webview.config.json"),
        currentDirectory.appendingPathComponent("desktop-host/webview.config.json")
    ]

    guard let configURL = candidates.first(where: { FileManager.default.fileExists(atPath: $0.path) }) else {
        fatalError("Failed to find apps/desktop-host/webview.config.json from \(currentDirectory.path)")
    }

    do {
        let data = try Data(contentsOf: configURL)
        return try JSONDecoder().decode(HostConfig.self, from: data)
    } catch {
        fatalError("Failed to load host config at \(configURL.path): \(error)")
    }
}

let application = NSApplication.shared
let delegate = AppDelegate()
application.delegate = delegate
application.run()
