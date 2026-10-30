// swift-tools-version: 6.2
//
// Reference runner for the C++ port: feeds the same PCM through Vespertine's own analyzer and
// prints the numbers in the same format, so the two can be diffed. macOS only, not part of the
// component build.
//
//   swift run vesper-parity <dump-dir>
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
import PackageDescription

let package = Package(
    name: "vesper-parity",
    platforms: [.macOS(.v14)],
    dependencies: [
        .package(path: "/Users/Gorilla/Workspace/_ref/Vespertine/Packages/VespertineAnalysis")
    ],
    targets: [
        .executableTarget(
            name: "vesper-parity",
            dependencies: [.product(name: "VespertineAnalysisCore", package: "VespertineAnalysis")]
        )
    ],
    swiftLanguageModes: [.v6]
)
