import SwiftUI

/// Colours from `@kithfield/theme`, by their token names. The day and night palettes
/// (`packages/theme/src/colour.ts`) are checked against the theme by a test; the few translucent
/// fills and shadows below them name the theme value they copy.
enum SurfacePalette {
  /// theme: night.sky
  static let sky = Color(hex: 0x1B1F3D)
  /// theme: night.moon
  static let moon = Color(hex: 0xF4ECDA)
  /// theme: night.moon2
  static let moon2 = Color(hex: 0xD9CFBD)
  /// theme: night.dim
  static let dim = Color(hex: 0xA9A3B8)
  /// theme: night.honey
  static let honey = Color(hex: 0xE8B44E)
  /// theme: night.panel
  static let panel = Color(hex: 0x23263F)
  /// theme: night.bubble
  static let bubble = Color(hex: 0x2F3352)
  /// theme: day.clay
  static let clay = Color(hex: 0xB0482F)
  /// theme: day.moss
  static let moss = Color(hex: 0x5E7F4A)
  /// theme: day.sheet
  static let sheet = Color(hex: 0xF7F1E7)
  /// theme: day.card
  static let card = Color(hex: 0xFFFAF2)
  /// theme: day.ink
  static let ink = Color(hex: 0x2A221D)
  /// theme: day.ink3
  static let ink3 = Color(hex: 0x6B5F55)
  /// theme: day.ink4
  static let ink4 = Color(hex: 0x857A70)

  /// The fire's own colours over the night scene (`fireRoom` in `packages/theme/src/fire.ts`).
  enum Fire {
    /// theme: fireRoom.glyph, the lantern's words
    static let glyph = Color(hex: 0xFFD98A)
    /// theme: fireRoom.ring, round the little critters
    static let ring = Color(hex: 0x2A2C48)
    /// theme: fireRoom.panel, rgba(24,26,48,.76)
    static let panel = Color(hex: 0x181A30, opacity: 0.76)
    /// theme: fireRoom.secondary, rgba(255,255,255,.12): the quieter round button
    static let secondary = Color(hex: 0xFFFFFF, opacity: 0.12)
  }

  /// A sheet's shadow over art: the colour of `gestureColours.<appearance>.menuShadow`.
  enum Shadow {
    /// theme: gestureColours.day.menuShadow, rgba(40,25,10,.45)
    static let day = Color(hex: 0x28190A, opacity: 0.45)
    /// theme: gestureColours.night.menuShadow, rgba(0,0,0,.6)
    static let night = Color(hex: 0x000000, opacity: 0.6)
  }
}

extension Color {
  init(hex: UInt32, opacity: Double = 1) {
    self.init(
      .sRGB,
      red: Double((hex >> 16) & 0xFF) / 255,
      green: Double((hex >> 8) & 0xFF) / 255,
      blue: Double(hex & 0xFF) / 255,
      opacity: opacity)
  }
}
