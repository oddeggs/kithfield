import ActivityKit
import SwiftUI
import WidgetKit

/// Who a Live Activity shows, from its state JSON: the people by the fire, or those there and on
/// their way to a plan, each as the critter still the app rendered (`SurfacePerson.image`).
private struct ActivityPeople: Decodable {
  struct Person: Decodable {
    let image: String
  }

  let people: [Person]?
  let here: [Person]?
  let onTheWay: [Person]?

  static func images(_ json: String) -> [UIImage] {
    guard let decoded = try? JSONDecoder().decode(ActivityPeople.self, from: Data(json.utf8))
    else { return [] }
    let all = (decoded.people ?? []) + (decoded.here ?? []) + (decoded.onTheWay ?? [])
    return all.compactMap { SurfaceData.image($0.image) }
  }
}

private struct Critters: View {
  let images: [UIImage]
  let limit: Int
  let size: CGFloat

  var body: some View {
    HStack(spacing: 4) {
      ForEach(Array(images.prefix(limit).enumerated()), id: \.offset) { _, image in
        Image(uiImage: image).resizable().scaledToFit().frame(width: size, height: size)
      }
    }
  }
}

/// The plan's day and the fire, on the Lock Screen and in the Dynamic Island.
struct SurfaceActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SurfaceAttributes.self) { context in
      Critters(images: ActivityPeople.images(context.state.json), limit: 8, size: 36)
        .padding(16)
        .activityBackgroundTint(Color("background"))
    } dynamicIsland: { context in
      let images = ActivityPeople.images(context.state.json)
      return DynamicIsland {
        DynamicIslandExpandedRegion(.bottom) {
          Critters(images: images, limit: 8, size: 32)
        }
      } compactLeading: {
        Critters(images: images, limit: 1, size: 20)
      } compactTrailing: {
        Critters(images: Array(images.dropFirst()), limit: 1, size: 20)
      } minimal: {
        Critters(images: images, limit: 1, size: 20)
      }
    }
  }
}
