import CoreText
import Foundation
import SwiftUI

/// The theme's fonts, which the app embeds. An extension sits inside the app's bundle
/// (`Kithfield.app/PlugIns/<name>.appex`), so it registers the app's copies for itself instead of
/// carrying its own.
enum SurfaceFonts {
  /// The hand face, Kithfield Hand, which writes English and Vietnamese alike.
  static let handName = "KithfieldHand-Bold"

  private static let registered: Void = {
    var bundle = Bundle.main.bundleURL
    if bundle.pathExtension == "appex" {
      bundle = bundle.deletingLastPathComponent().deletingLastPathComponent()
    }
    let url = bundle.appendingPathComponent("\(handName).ttf")
    CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
  }()

  /// The hand face at the design's size, growing and shrinking with the person's text size as
  /// `style` does.
  static func hand(_ size: CGFloat, relativeTo style: Font.TextStyle) -> Font {
    _ = registered
    return Font.custom(handName, size: size, relativeTo: style)
  }
}

/// The system face at the design's size, scaled with the person's text size as `style` is (and
/// held by any `dynamicTypeSize` limit above it).
private struct ScaledSystemFont: ViewModifier {
  @ScaledMetric private var size: CGFloat
  private let weight: Font.Weight

  init(size: CGFloat, weight: Font.Weight, relativeTo style: Font.TextStyle) {
    _size = ScaledMetric(wrappedValue: size, relativeTo: style)
    self.weight = weight
  }

  func body(content: Content) -> some View {
    content.font(.system(size: size, weight: weight))
  }
}

extension View {
  /// `.font(.system(size:weight:))` that follows Dynamic Type along `style`.
  func scaledFont(_ size: CGFloat, weight: Font.Weight = .regular, relativeTo style: Font.TextStyle)
    -> some View
  {
    modifier(ScaledSystemFont(size: size, weight: weight, relativeTo: style))
  }
}
