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
}

/// `SurfaceFarm`: one farm or visit.
struct SurfaceFarm: Decodable {
  struct Images: Decodable {
    let day: String
    let night: String
  }

  let farm: String
  let kind: String
  /// Null for a visit.
  let name: String?
  let images: Images
  /// Opens the farm.
  let link: String
  let updatedAt: Double
}
