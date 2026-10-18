import SwiftUI

/// Colours from `@kithfield/theme` (`packages/theme/src/colour.ts`), by their token names; a test
/// checks each against the theme.
enum SurfacePalette {
  /// theme: night.moon
  static let moon = Color(hex: 0xF4ECDA)
  /// theme: night.moon2
  static let moon2 = Color(hex: 0xD9CFBD)
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
