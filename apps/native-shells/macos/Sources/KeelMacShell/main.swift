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
        bridge.hideTransientSurfaces()
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
            hideTransientSurfaces()
            window?.orderOut(nil)
        case "toast.show":
            panels.showToast(params: params, relativeTo: window)
        case "toast.hide":
            panels.hideToast(id: params["id"] as? String)
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

    func hideWindow() {
        hideTransientSurfaces()
        window?.orderOut(nil)
    }

    func hideTransientSurfaces() {
        panels.hideAll()
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

struct HotkeyRegistration: Equatable {
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

        if registrations[id] == registration {
            return
        }
        registrations[id] = registration
        installMonitorsIfNeeded()
        NSLog("[Keel hotkey] Registered %@", accelerator)
    }

    private func installMonitorsIfNeeded() {
        if localMonitor == nil {
            localMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { [weak self] event in
                self?.handle(event: event, allowEscape: true) == true ? nil : event
            }
        }
        if globalMonitor == nil {
            globalMonitor = NSEvent.addGlobalMonitorForEvents(matching: .keyDown) { [weak self] event in
                _ = self?.handle(event: event, allowEscape: false)
            }
        }
    }

    private func handle(event: NSEvent, allowEscape: Bool) -> Bool {
        if allowEscape && isEscape(event: event) {
            bridge?.hideWindow()
            return true
        }

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
        let key = normalizedEventKey(event)
        let flags = event.modifierFlags.intersection(.deviceIndependentFlagsMask)
        return key == registration.key && flags.isSuperset(of: registration.modifiers)
    }

    private func parse(id: String, accelerator: String, action: String?) -> HotkeyRegistration? {
        let parts = accelerator.split(separator: "+").map {
            String($0).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        }
        guard let rawKey = parts.last, !rawKey.isEmpty else { return nil }
        let key = normalizedAcceleratorKey(rawKey)
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

    private func isEscape(event: NSEvent) -> Bool {
        event.keyCode == 53 || event.charactersIgnoringModifiers == "\u{1b}"
    }

    private func normalizedEventKey(_ event: NSEvent) -> String {
        if event.keyCode == 49 { return " " }
        return event.charactersIgnoringModifiers?.lowercased() ?? ""
    }

    private func normalizedAcceleratorKey(_ key: String) -> String {
        switch key {
        case "space": return " "
        case "esc", "escape": return "\u{1b}"
        default: return key
        }
    }

    private func acceleratorString(_ registration: HotkeyRegistration) -> String {
        var parts: [String] = []
        if registration.modifiers.contains(.command) { parts.append("Command") }
        if registration.modifiers.contains(.shift) { parts.append("Shift") }
        if registration.modifiers.contains(.option) { parts.append("Option") }
        if registration.modifiers.contains(.control) { parts.append("Control") }
        parts.append(registration.key == " " ? "Space" : registration.key.uppercased())
        return parts.joined(separator: "+")
    }
}

enum FloatingPanelKind: Equatable {
    case popover
    case tooltip
    case toast
}

final class FloatingPanelPresenter {
    private let popoverMinSize = NSSize(width: 160, height: 48)
    private let popoverMaxSize = NSSize(width: 320, height: 180)
    private let tooltipMinSize = NSSize(width: 72, height: 34)
    private let tooltipMaxSize = NSSize(width: 240, height: 72)
    private let toastMinSize = NSSize(width: 180, height: 48)
    private let toastMaxSize = NSSize(width: 320, height: 140)
    private let cornerRadius: CGFloat = 10
    private let anchorOffset: CGFloat = 10
    private let toastScreenVerticalRatio: CGFloat = 0.24
    private var panels: [String: NSPanel] = [:]

    func showPopover(params: [String: Any], relativeTo window: NSWindow?) {
        let id = params["id"] as? String ?? "popover"
        let title = params["title"] as? String ?? "Keel"
        let message = params["message"] as? String ?? ""
        showPanel(id: id, title: title, message: message, params: params, relativeTo: window, kind: .popover)
    }

    func hidePopover(id: String?) {
        hide(id: id ?? "popover")
    }

    func showTooltip(params: [String: Any], relativeTo window: NSWindow?) {
        let id = params["id"] as? String ?? "tooltip"
        let text = params["text"] as? String ?? ""
        showPanel(id: id, title: text, message: "", params: params, relativeTo: window, kind: .tooltip)
    }

    func hideTooltip(id: String?) {
        hide(id: id ?? "tooltip")
    }

    func showToast(params: [String: Any], relativeTo window: NSWindow?) {
        let id = params["id"] as? String ?? "toast"
        let title = params["title"] as? String ?? "Keel"
        let message = params["message"] as? String ?? ""
        showPanel(id: id, title: title, message: message, params: params, relativeTo: window, kind: .toast)
    }

    func hideToast(id: String?) {
        hide(id: id ?? "toast")
    }

    func hideAll() {
        for panel in panels.values {
            panel.orderOut(nil)
        }
        panels.removeAll()
    }

    private func showPanel(
        id: String,
        title: String,
        message: String,
        params: [String: Any],
        relativeTo window: NSWindow?,
        kind: FloatingPanelKind
    ) {
        hide(id: id)
        let isTooltip = kind == .tooltip
        let titleFont = NSFont.systemFont(ofSize: isTooltip ? 12 : 13, weight: .semibold)
        let messageFont = NSFont.systemFont(ofSize: 12, weight: .regular)
        let layout = panelLayout(
            title: title,
            message: message,
            titleFont: titleFont,
            messageFont: messageFont,
            kind: kind
        )
        let panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: layout.size),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.level = .floating
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false

        let container = NSVisualEffectView(frame: NSRect(origin: .zero, size: layout.size))
        container.autoresizingMask = [.width, .height]
        container.material = .popover
        container.blendingMode = .behindWindow
        container.state = .active
        container.wantsLayer = true
        container.layer?.cornerRadius = cornerRadius
        container.layer?.masksToBounds = true

        let stack = NSStackView(frame: NSRect(
            x: layout.horizontalInset,
            y: layout.verticalInset,
            width: layout.contentWidth,
            height: layout.size.height - (layout.verticalInset * 2)
        ))
        stack.orientation = .vertical
        stack.spacing = layout.spacing
        stack.alignment = .leading
        stack.addArrangedSubview(label(
            title,
            font: titleFont,
            color: .labelColor,
            maxWidth: layout.contentWidth,
            lineLimit: 1
        ))
        if !message.isEmpty {
            stack.addArrangedSubview(label(
                message,
                font: messageFont,
                color: .secondaryLabelColor,
                maxWidth: layout.contentWidth,
                lineLimit: 3
            ))
        }
        container.addSubview(stack)
        panel.contentView = container

        panel.setFrameOrigin(origin(params: params, relativeTo: window, panelSize: panel.frame.size, kind: kind))
        panel.orderFrontRegardless()
        panels[id] = panel

        if kind == .tooltip || kind == .toast {
            let duration = kind == .tooltip ? 2.0 : 3.2
            DispatchQueue.main.asyncAfter(deadline: .now() + duration) { [weak self] in
                self?.hide(id: id)
            }
        }
    }

    private func hide(id: String) {
        panels[id]?.orderOut(nil)
        panels[id] = nil
    }

    private func label(_ text: String, font: NSFont, color: NSColor, maxWidth: CGFloat, lineLimit: Int) -> NSTextField {
        let field = NSTextField(labelWithString: text)
        field.font = font
        field.textColor = color
        field.maximumNumberOfLines = lineLimit
        field.lineBreakMode = lineLimit == 1 ? .byTruncatingTail : .byWordWrapping
        field.preferredMaxLayoutWidth = maxWidth
        field.frame = NSRect(x: 0, y: 0, width: maxWidth, height: field.intrinsicContentSize.height)
        return field
    }

    private func panelLayout(
        title: String,
        message: String,
        titleFont: NSFont,
        messageFont: NSFont,
        kind: FloatingPanelKind
    ) -> (size: NSSize, horizontalInset: CGFloat, verticalInset: CGFloat, contentWidth: CGFloat, spacing: CGFloat) {
        let minSize = minSize(for: kind)
        let maxSize = maxSize(for: kind)
        let horizontalInset: CGFloat = kind == .tooltip ? 12 : 14
        let verticalInset: CGFloat = kind == .tooltip ? 9 : 12
        let spacing: CGFloat = message.isEmpty ? 0 : 4
        let maxContentWidth = maxSize.width - (horizontalInset * 2)
        let minContentWidth = minSize.width - (horizontalInset * 2)
        let naturalTitleWidth = singleLineSize(title, font: titleFont).width
        let naturalMessageWidth = message.isEmpty ? 0 : singleLineSize(message, font: messageFont).width
        let contentWidth = clamp(max(naturalTitleWidth, naturalMessageWidth, minContentWidth), minContentWidth, maxContentWidth)
        let titleHeight = lineHeight(titleFont)
        let messageHeight = message.isEmpty
            ? 0
            : min(multilineHeight(message, font: messageFont, width: contentWidth), lineHeight(messageFont) * 3)
        let contentHeight = titleHeight + spacing + messageHeight
        let width = clamp(contentWidth + (horizontalInset * 2), minSize.width, maxSize.width)
        let height = clamp(contentHeight + (verticalInset * 2), minSize.height, maxSize.height)
        return (NSSize(width: ceil(width), height: ceil(height)), horizontalInset, verticalInset, contentWidth, spacing)
    }

    private func minSize(for kind: FloatingPanelKind) -> NSSize {
        switch kind {
        case .popover:
            return popoverMinSize
        case .tooltip:
            return tooltipMinSize
        case .toast:
            return toastMinSize
        }
    }

    private func maxSize(for kind: FloatingPanelKind) -> NSSize {
        switch kind {
        case .popover:
            return popoverMaxSize
        case .tooltip:
            return tooltipMaxSize
        case .toast:
            return toastMaxSize
        }
    }

    private func singleLineSize(_ text: String, font: NSFont) -> NSSize {
        NSAttributedString(string: text, attributes: [.font: font]).size()
    }

    private func multilineHeight(_ text: String, font: NSFont, width: CGFloat) -> CGFloat {
        let rect = (text as NSString).boundingRect(
            with: NSSize(width: width, height: .greatestFiniteMagnitude),
            options: [.usesLineFragmentOrigin, .usesFontLeading],
            attributes: [.font: font]
        )
        return ceil(rect.height)
    }

    private func lineHeight(_ font: NSFont) -> CGFloat {
        ceil(font.ascender - font.descender + font.leading)
    }

    private func clamp(_ value: CGFloat, _ minValue: CGFloat, _ maxValue: CGFloat) -> CGFloat {
        min(max(value, minValue), maxValue)
    }

    private func origin(params: [String: Any], relativeTo window: NSWindow?, panelSize: NSSize, kind: FloatingPanelKind) -> NSPoint {
        if kind == .toast {
            let screenFrame = (window?.screen ?? NSScreen.main)?.visibleFrame
                ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
            let x = screenFrame.midX - (panelSize.width / 2)
            let y = screenFrame.minY + (screenFrame.height * toastScreenVerticalRatio)
            return NSPoint(
                x: clamp(x, screenFrame.minX, screenFrame.maxX - panelSize.width),
                y: clamp(y, screenFrame.minY, screenFrame.maxY - panelSize.height)
            )
        }

        guard let anchor = params["anchorRect"] as? [String: Any],
              let window else {
            return NSPoint(x: 120, y: 120)
        }

        let x = anchor["x"] as? CGFloat ?? 0
        let y = anchor["y"] as? CGFloat ?? 0
        let height = anchor["height"] as? CGFloat ?? 0
        let localPoint = NSPoint(x: x, y: y + height + anchorOffset)
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
