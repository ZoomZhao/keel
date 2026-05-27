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
}

struct MacWindowConfig: Decodable {
    let activationPolicy: String?
    let material: String?
    let level: String?
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        let config = loadHostConfig()
        let launcher = config.windows.first { $0.kind == "launcher" } ?? config.windows[0]
        let webView = makeWebView(config: config)
        let window = makeWindow(config: config, launcher: launcher, webView: webView)
        self.window = window

        if config.platform?.macos?.window?.activationPolicy == "accessory" {
            NSApp.setActivationPolicy(.accessory)
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    private func makeWebView(config: HostConfig) -> WKWebView {
        let preferences = WKWebpagePreferences()
        preferences.allowsContentJavaScript = true

        let webConfig = WKWebViewConfiguration()
        webConfig.defaultWebpagePreferences = preferences

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
