// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "KeelMacShell",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "KeelMacShell", targets: ["KeelMacShell"])
    ],
    targets: [
        .executableTarget(name: "KeelMacShell")
    ]
)

