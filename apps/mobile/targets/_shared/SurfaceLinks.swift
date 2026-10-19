import Foundation

/// The app's links (`kithfield://surfaces/open?to=…`), as `src/features/surfaces/links.ts` makes
/// them. A surface turns a farm's link into the fire room's or a plan's.
enum SurfaceLinks {
  static func fire(_ farmLink: String) -> String {
    farmLink.replacingOccurrences(of: "to=farm", with: "to=fire")
  }

  static func plan(_ farmLink: String, seed: Int) -> String {
    farmLink.replacingOccurrences(of: "to=farm", with: "to=plan") + "&seed=\(seed)"
  }
}
