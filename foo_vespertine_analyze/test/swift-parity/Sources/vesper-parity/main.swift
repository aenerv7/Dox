//
// vesper-parity — runs Vespertine's own analyzer over the PCM dumped by core_test and prints the
// numbers in the same format as the C++ side, so the two can be diffed line by line.
//
// SPDX-License-Identifier: GPL-3.0-or-later
//
import Foundation
import VespertineAnalysisCore

@MainActor func key(_ v: FileAnalysis.Verdict) -> String {
    switch v {
    case .genuine: return "genuine"
    case .paddedBitDepth: return "padded"
    case .upsampled: return "upsampled"
    case .possibleLossyOrigin: return "lossy-origin"
    case .bandwidthExtended: return "extended"
    case .notApplicable: return "n/a"
    }
}

var out: [String] = []
@MainActor func put(_ name: String, _ value: String) { out.append("\(name)=\(value)") }
@MainActor func put(_ name: String, _ value: Double) {
    out.append(String(format: "%@=%.9g", name, value))
}
@MainActor func put(_ name: String, _ value: Int) { out.append("\(name)=\(value)") }
@MainActor func putOpt(_ name: String, _ value: Double?) {
    out.append(String(format: "%@=%.9g", name, value ?? Double.nan))
}

@MainActor func report(_ a: FileAnalysis) {
    put("verdict", key(a.verdict))
    put("confidence", a.confidence)
    put("bandwidthHz", a.bandwidthHz)
    put("peakDBFS", a.peakDBFS)
    put("clippedSamples", a.clippedSamples)
    put("secondsAnalyzed", a.secondsAnalyzed)
    put("summary", a.summary)
    guard let f = a.forensics else { return }
    putOpt("cliffHz", f.cliffHz)
    put("cliffDropDB", f.cliffDropDB)
    put("cliffConsistency", f.cliffConsistency)
    put("belowDB", f.belowDB)
    put("aboveDB", f.aboveDB)
    put("floorDB", f.floorDB)
    put("extensionHz", f.extensionHz)
    put("extensionSlope", f.extensionSlope)
    put("holeRatio", f.holeRatio)
    put("contentHz", f.contentHz)
    put("framesAnalyzed", f.framesAnalyzed)
    putOpt("shelfHz", f.shelfHz)
    put("shelfStepDB", f.shelfStepDB)
    put("shelfEndHz", f.shelfEndHz)
    put("shelfSlope", f.shelfSlope)
    put("shelfAboveFloorDB", f.shelfAboveFloorDB)
    put("shelfConsistency", f.shelfConsistency)
    putOpt("shelfTracking", f.shelfTracking)
    putOpt("mirrorHz", f.mirrorHz)
    putOpt("mirrorCorrelation", f.mirrorCorrelation)
    if let frames = f.mirrorFrames { put("mirrorFrames", frames) } else { put("mirrorFrames", "none") }
}

guard CommandLine.arguments.count > 1 else {
    FileHandle.standardError.write("usage: vesper-parity <dump-dir>\n".data(using: .utf8)!)
    exit(2)
}
let dir = URL(fileURLWithPath: CommandLine.arguments[1])

var failed = 0
let cases = (try? FileManager.default.contentsOfDirectory(atPath: dir.path))?
    .filter { $0.hasSuffix(".f32") }
    .map { String($0.dropLast(4)) }
    .sorted() ?? []

for name in cases {
    let base = dir.appendingPathComponent(name)
    let meta = (try? String(contentsOf: base.appendingPathExtension("meta"), encoding: .utf8)) ?? ""
    var sampleRate = 0.0
    var claimed: Int? = nil
    for line in meta.split(separator: "\n") {
        let parts = line.split(separator: "=", maxSplits: 1)
        guard parts.count == 2 else { continue }
        if parts[0] == "sampleRate" { sampleRate = Double(parts[1]) ?? 0 }
        if parts[0] == "claimed" { let v = Int(parts[1]) ?? 0; claimed = v > 0 ? v : nil }
    }
    guard let data = try? Data(contentsOf: base.appendingPathExtension("f32")), sampleRate > 0 else {
        FileHandle.standardError.write("cannot read \(name)\n".data(using: .utf8)!)
        failed += 1
        continue
    }
    let samples = data.withUnsafeBytes { Array($0.bindMemory(to: Float.self)) }
    out.removeAll()

    let accumulator = AnalysisAccumulator(
        sampleRate: sampleRate, channels: 1, claimedBitDepth: claimed, forcePortableFFT: true)
    samples.withUnsafeBufferPointer { buffer in
        do {
            try accumulator.add(interleaved: buffer, frames: buffer.count)
        } catch {
            FileHandle.standardError.write("\(name): \(error)\n".data(using: .utf8)!)
            failed += 1
        }
    }
    report(accumulator.finish())
    let text = out.joined(separator: "\n") + "\n"
    try? text.write(to: base.appendingPathExtension("swift.txt"), atomically: true, encoding: .utf8)
    print("\(name) done")
}

exit(failed == 0 ? 0 : 1)
