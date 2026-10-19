import Foundation

/// The names the app gives the images it renders beyond `SurfaceFarm.images`, and the rules a
/// widget works its picture out by. The app's side is `src/features/surfaces/names.ts`; a test
/// checks the two agree.
enum SurfaceNames {
  /// `LIT_WINDOW_MS`: a window is lit when its person opened the farm within this long.
  static let litWindowMs: Double = 3 * 60 * 60 * 1000

  /// The widget scene's homes, in the order of the bits of a lit mask.
  static let homes = ["rabbit", "hedgehog", "frog", "mole", "sheep", "owl"]

  /// A short stable tag for an id: FNV-1a over its UTF-8, 64 bits, the top 52 in base 36. The
  /// server tags push keys the same way, so it can name a critter's still too.
  static func tag(_ id: String) -> String {
    var hash: UInt64 = 0xcbf2_9ce4_8422_2325
    for byte in id.utf8 {
      hash ^= UInt64(byte)
      hash = hash &* 0x0000_0100_0000_01b3
    }
    return String(hash >> 12, radix: 36)
  }

  static func mask(_ lit: Set<String>) -> Int {
    homes.enumerated().reduce(0) { mask, home in
      lit.contains(home.element) ? mask | (1 << home.offset) : mask
    }
  }

  /// The medium widget's night farm with these windows lit.
  static func medium(farm: String, lit: Set<String>) -> String {
    "widget-\(tag(farm))-\(mask(lit)).png"
  }

  /// The large widget's night farm with these windows lit.
  static func large(farm: String, lit: Set<String>) -> String {
    "widgetl-\(tag(farm))-\(mask(lit)).png"
  }

  /// The medium widget while the fire is lit.
  static func mediumFire(farm: String) -> String { "widgetfire-\(tag(farm)).png" }

  /// The small fire, by season: the small widget and the fire's round icon.
  static func smallFire(season: String) -> String { "firesmall-\(season).png" }

  /// The fire room's still, by season: the fire's Live Activity on the Lock Screen.
  static func fireRoom(season: String) -> String { "fireroom-\(season).png" }

  /// The path to a plan, without its walkers, by season: the plan's Live Activity.
  static func walk(season: String) -> String { "walk-\(season).png" }

  /// A sprouted seed: a plan push's picture.
  static let seed = "seed.png"

  /// A person's critter, as the avatar frames it.
  static func critter(person: String) -> String { "critter-\(tag(person)).png" }
}
