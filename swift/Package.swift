// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UnifiedLLSD",
    platforms: [
        .macOS(.v11)
    ],
    products: [
        .library(
            name: "UnifiedLLSD",
            targets: ["UnifiedLLSD"]),
    ],
    targets: [
        .target(
            name: "UnifiedLLSD",
            dependencies: []),
        .testTarget(
            name: "UnifiedLLSDTests",
            dependencies: ["UnifiedLLSD"]),
    ]
)
