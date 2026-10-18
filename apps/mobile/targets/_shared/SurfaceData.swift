import Foundation
import UIKit

/// What the surfaces draw, as the app wrote it: `SurfaceData` in
/// `packages/contracts/src/surfaces.ts`. Only the fields a surface reads are decoded; times are
/// epoch milliseconds, and every text is already in the person's language.
struct SurfaceData: Decodable {
  /// `SURFACES_VERSION`. A file of another version draws nothing.
  static let version = 1

  let version: Int
  let lang: String
  let writtenAt: Double
  let farms: [SurfaceFarm]

  private struct Header: Decodable {
    let version: Int
  }

  /// The file in the App Group, or nil when there is none yet or it is of another version.
  static func read() -> SurfaceData? {
    guard let url = GroupFiles.url(GroupFiles.data), let data = try? Data(contentsOf: url),
      let header = try? JSONDecoder().decode(Header.self, from: data),
      header.version == version
    else { return nil }
    return try? JSONDecoder().decode(SurfaceData.self, from: data)
  }

  /// A PNG the app rendered into `surfaces/images/`, by its `SurfaceImage` name.
  static func image(_ name: String) -> UIImage? {
    guard let url = GroupFiles.url(GroupFiles.images + name) else { return nil }
    return UIImage(contentsOfFile: url.path)
  }

  /// The farm with this id, or the one with the newest activity.
  func farm(_ id: String?) -> SurfaceFarm? {
    if let id, let found = farms.first(where: { $0.farm == id }) { return found }
    return farms.max { $0.updatedAt < $1.updatedAt }
  }
}

/// `SurfacePerson`: someone as a surface draws them.
struct SurfacePerson: Decodable, Hashable {
  let person: String
  /// Null for a member whose name is gone.
  let name: String?
  let image: String
}

/// `SurfaceCritter`: a critter with the times its window and sleep are worked out from.
struct SurfaceCritter: Decodable {
  struct Look: Decodable {
    let species: String
  }

  let person: String
  let name: String?
  let image: String
  let critter: Look
  let lastOpenedAt: Double?
  let hibernating: Bool
  let pausedUntil: Double?
  /// Opens this friend's critter card.
  let link: String

  /// The window is lit: they opened the farm within `SurfaceNames.litWindowMs` of `now`.
  func lit(at now: Date) -> Bool {
    guard !hibernating, let opened = lastOpenedAt else { return false }
    if let paused = pausedUntil, paused > now.epochMs { return false }
    return now.epochMs - opened < SurfaceNames.litWindowMs && opened <= now.epochMs
  }

  /// When the window goes dark again, if it is lit at `now`.
  func dims(after now: Date) -> Date? {
    guard lit(at: now), let opened = lastOpenedAt else { return nil }
    return Date(epochMs: opened + SurfaceNames.litWindowMs)
  }
}

/// `SurfaceFarm`: one farm or visit.
struct SurfaceFarm: Decodable {
  struct Images: Decodable {
    let day: String
    let night: String
  }

  struct Season: Decodable {
    let season: String
  }

  struct Fire: Decodable {
    let litAt: Double
    let people: [SurfacePerson]
  }

  struct Plan: Decodable {
    let seed: Int
    let title: String
    /// `YYYY-MM-DD`, local to the farm.
    let date: String
    /// `HH:MM`, or null for a whole-day plan.
    let from: String?
    let place: String?
  }

  let farm: String
  let kind: String
  /// Null for a visit.
  let name: String?
  let with: SurfacePerson?
  let season: Season
  let images: Images
  let critters: [SurfaceCritter]
  let fire: Fire?
  let nextPlan: Plan?
  /// Opens the farm.
  let link: String
  let updatedAt: Double

  /// The name a surface titles it with: the farm's, or the friend's on a visit.
  var title: String { name ?? with?.name ?? "" }

  /// The critters whose windows are lit at `now`, by the art's kind names.
  func litKinds(at now: Date) -> Set<String> {
    Set(critters.filter { $0.lit(at: now) }.map(\.critter.species))
  }
}

extension Date {
  var epochMs: Double { timeIntervalSince1970 * 1000 }
  init(epochMs: Double) { self.init(timeIntervalSince1970: epochMs / 1000) }
}
