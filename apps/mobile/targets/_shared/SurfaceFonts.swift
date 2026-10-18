import CoreText
import Foundation
import SwiftUI

/// The theme's fonts, which the app embeds. An extension sits inside the app's bundle
/// (`Kithfield.app/PlugIns/<name>.appex`), so it registers the app's copies for itself instead of
/// carrying its own.
enum SurfaceFonts {
  static let handwritten = "Gaegu-Bold"
  static let serif = "YoungSerif-Regular"

  private static let registered: Void = {
    var bundle = Bundle.main.bundleURL
    if bundle.pathExtension == "appex" {
      bundle = bundle.deletingLastPathComponent().deletingLastPathComponent()
    }
    for name in [handwritten, serif] {
      let url = bundle.appendingPathComponent("\(name).ttf")
      CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
    }
  }()

  /// The handwritten face the design titles widgets in, or the system's rounded one without it.
  static func gaegu(_ size: CGFloat) -> Font {
    _ = registered
    return Font.custom(handwritten, fixedSize: size)
  }

  static func youngSerif(_ size: CGFloat) -> Font {
    _ = registered
    return Font.custom(serif, fixedSize: size)
  }
}
