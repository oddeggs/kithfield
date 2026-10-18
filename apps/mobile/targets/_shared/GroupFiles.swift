import Foundation

/// The App Group the app and its extensions share (`group.com.kithfield.app`, or `.dev` for
/// Kithfield Dev), and the files the app leaves in it for them. The paths are `APP_GROUP_PATHS`
/// in `packages/contracts/src/surfaces.ts`.
enum GroupFiles {
  /// `SurfaceData`, rewritten by the app after farm activity.
  static let data = "surfaces/data.json"
  /// The PNGs `SurfaceImage` names, rendered by the app from the art.
  static let images = "surfaces/images/"
  /// One `ShareDraft` per file, left by the share extension for the app to send.
  static let shareOutbox = "surfaces/share-outbox/"
  /// `{ "person": id }`: whom the surfaces were written for, so they say "you" for them.
  static let person = "surfaces/person.json"
  /// The sticker files the Messages extension offers.
  static let stickers = "surfaces/stickers/"

  /// The app's bundle id, also from inside an extension (whose id is the app's plus one part).
  static let appBundleId: String = {
    let id = Bundle.main.bundleIdentifier ?? ""
    guard Bundle.main.bundleURL.pathExtension == "appex" else { return id }
    return id.split(separator: ".").dropLast().joined(separator: ".")
  }()

  static var groupId: String { "group.\(appBundleId)" }

  /// A file or folder in the group by its path above; nil when the group isn't available.
  static func url(_ path: String) -> URL? {
    FileManager.default
      .containerURL(forSecurityApplicationGroupIdentifier: groupId)?
      .appendingPathComponent(path)
  }
}
