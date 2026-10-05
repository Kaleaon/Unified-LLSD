// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "UnifiedLLSD",
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
