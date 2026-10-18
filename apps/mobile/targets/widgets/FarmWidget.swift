import SwiftUI
import WidgetKit

/// One farm as the app last wrote it: its still, day or night with the home screen.
struct FarmEntry: TimelineEntry {
  let date: Date
  let farm: SurfaceFarm?
}

struct FarmTimeline: TimelineProvider {
  func placeholder(in context: Context) -> FarmEntry {
    FarmEntry(date: .now, farm: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (FarmEntry) -> Void) {
    completion(entry())
  }

  /// One entry; the app reloads the timeline when it rewrites the file.
  func getTimeline(in context: Context, completion: @escaping (Timeline<FarmEntry>) -> Void) {
    completion(Timeline(entries: [entry()], policy: .never))
  }

  private func entry() -> FarmEntry {
    FarmEntry(date: .now, farm: SurfaceData.read()?.farms.first)
  }
}

struct FarmWidgetView: View {
  let entry: FarmEntry
  @Environment(\.colorScheme) private var scheme

  var body: some View {
    let still = entry.farm.flatMap {
      SurfaceData.image(scheme == .dark ? $0.images.night : $0.images.day)
    }
    Group {
      if let still {
        Image(uiImage: still).resizable().scaledToFill()
      } else {
        Color.clear
      }
    }
    .containerBackground(for: .widget) { Color("background") }
    .widgetURL(entry.farm.flatMap { URL(string: $0.link) })
  }
}

struct FarmWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "farm", provider: FarmTimeline()) { entry in
      FarmWidgetView(entry: entry)
    }
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}
