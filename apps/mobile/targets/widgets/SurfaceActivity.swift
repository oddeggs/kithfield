import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/* The plan's day and the fire, on the Lock Screen and in the Dynamic Island. Each activity's
 * attributes and state arrive as the JSON the app (or the server) wrote: `PlanDayActivity` and
 * `FireActivity` in `packages/contracts/src/surfaces.ts`. */

/// `PlanDayActivity['attributes']`.
struct PlanDayAttributes: Decodable {
  let farm: String
  let seed: Int
  let title: String
  let place: String?
  let date: String
  let from: String?
  let link: String
}

/// `PlanDayActivity['state']`.
struct PlanDayState: Decodable {
  let here: [SurfacePerson]
  let onTheWay: [SurfacePerson]
}

/// `FireActivity['attributes']`.
struct FireAttributes: Decodable {
  let farm: String
  let farmName: String?
  let link: String
}

/// `FireActivity['state']`.
struct FireState: Decodable {
  let people: [SurfacePerson]
  let talking: String?
  let muted: Bool
  let listening: Bool
}

private func decode<T: Decodable>(_ json: String) -> T? {
  try? JSONDecoder().decode(T.self, from: Data(json.utf8))
}

/// What the surfaces know of the person: the language, and the season the art is drawn in.
private struct Context {
  let copy: SurfaceCopy
  let data: SurfaceData?

  static func load() -> Context {
    let data = SurfaceData.read()
    return Context(copy: SurfaceCopy(lang: data?.lang), data: data)
  }

  func season(_ farm: String) -> String { data?.farm(farm)?.season.season ?? "autumn" }

  /// The person's own name as the app wrote it into a state ("you").
  var you: String { copy.text("you") }
}

/// A person's critter, framed as the avatar frames it.
private struct Head: View {
  let person: SurfacePerson
  let size: CGFloat
  var ring: Color = .black

  var body: some View {
    Group {
      if let image = SurfaceData.image(person.image)
        ?? SurfaceData.image(SurfaceNames.critter(person: person.person))
      {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        SurfacePalette.bubble
      }
    }
    .frame(width: size, height: size)
    .clipShape(Circle())
    .overlay(Circle().stroke(ring, lineWidth: 2))
  }
}

/// Heads in a row, each over the last by 8 points.
private struct Heads: View {
  let people: [SurfacePerson]
  let size: CGFloat
  var ring: Color = .black
  var limit = 6

  var body: some View {
    HStack(spacing: -8) {
      ForEach(Array(people.prefix(limit)), id: \.person) { person in
        Head(person: person, size: size, ring: ring)
      }
    }
  }
}

/// A still from the App Group, clipped to a rounded rectangle.
private struct Art: View {
  let name: String
  let width: CGFloat
  let height: CGFloat
  let radius: CGFloat

  var body: some View {
    Group {
      if let image = SurfaceData.image(name) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        SurfacePalette.bubble
      }
    }
    .frame(width: width, height: height)
    .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
  }
}

/* The plan's day */

/// The path to the plan, its walkers placed along it: who's there by the fire, who's on the way
/// stepping along the curve the art draws (`S.walk`).
private struct Walk: View {
  let season: String
  let state: PlanDayState

  private static func along(_ u: Double, _ size: CGSize) -> CGPoint {
    let (w, h) = (size.width, size.height)
    let p0 = CGPoint(x: w * 0.04, y: h * 0.84), p1 = CGPoint(x: w * 0.35, y: h * 0.76)
    let p2 = CGPoint(x: w * 0.6, y: h * 0.92), p3 = CGPoint(x: w * 0.86, y: h * 0.8)
    let m = 1 - u
    let a = m * m * m, b = 3 * m * m * u, c = 3 * m * u * u, d = u * u * u
    return CGPoint(
      x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y)
  }

  var body: some View {
    GeometryReader { geo in
      let size = geo.size
      ZStack(alignment: .topLeading) {
        Art(name: SurfaceNames.walk(season: season), width: size.width, height: size.height, radius: 16)
        ForEach(Array(placed(size).enumerated()), id: \.offset) { _, walker in
          walker.image
            .resizable()
            .scaledToFit()
            .frame(width: size.height * 0.42, height: size.height * 0.42)
            .position(x: walker.at.x, y: walker.at.y - size.height * 0.16)
        }
      }
    }
  }

  private struct Placed {
    let image: Image
    let at: CGPoint
  }

  /// On the way: spread along the first two thirds. There: gathered by the fire.
  private func placed(_ size: CGSize) -> [Placed] {
    func image(_ p: SurfacePerson) -> Image? {
      (SurfaceData.image("walker-\(SurfaceNames.tag(p.person)).png") ?? SurfaceData.image(p.image))
        .map { Image(uiImage: $0) }
    }
    let walking = state.onTheWay.prefix(5).enumerated().compactMap { i, p -> Placed? in
      let u = 0.14 + Double(i) * 0.14
      return image(p).map { Placed(image: $0, at: Self.along(u, size)) }
    }
    let there = state.here.prefix(4).enumerated().compactMap { i, p -> Placed? in
      let point = Self.along(0.98, size)
      return image(p).map {
        Placed(image: $0, at: CGPoint(x: point.x - size.width * (0.1 + Double(i) * 0.08), y: point.y))
      }
    }
    return walking + there
  }
}

private struct PlanDayLockScreen: View {
  let attributes: PlanDayAttributes
  let state: PlanDayState
  let context: Context

  var body: some View {
    let copy = context.copy
    VStack(alignment: .leading, spacing: 10) {
      HStack(spacing: 8) {
        Art(name: "appicon.png", width: 24, height: 24, radius: 7)
        Text(attributes.title).font(.system(size: 15, weight: .semibold)).lineLimit(1)
        Spacer(minLength: 4)
        if let from = attributes.from {
          Text(copy.text("plan.from", ["time": PlanTime.hour(from, copy: copy)]))
            .font(.system(size: 13, weight: .semibold))
            .foregroundStyle(SurfacePalette.honey)
        }
      }
      Walk(season: context.season(attributes.farm), state: state).frame(height: 92)
      HStack(alignment: .center, spacing: 10) {
        Text(summary)
          .font(.system(size: 13.5))
          .foregroundStyle(SurfacePalette.moon2)
          .fixedSize(horizontal: false, vertical: true)
        Spacer(minLength: 0)
        if let start = PlanTime.start(date: attributes.date, from: attributes.from), start > .now {
          Text(start, style: .relative)
            .font(.system(size: 22, weight: .bold))
            .multilineTextAlignment(.trailing)
            .frame(maxWidth: 90, alignment: .trailing)
        }
      }
    }
    .foregroundStyle(SurfacePalette.moon)
    .padding(14)
    .environment(\.locale, copy.locale)
  }

  private var summary: String {
    let copy = context.copy
    let there = state.here.compactMap(\.name)
    let walking = state.onTheWay.compactMap(\.name)
    var parts: [String] = []
    parts.append(there.isEmpty ? copy.text("plan.nobodyYet") : copy.people("plan.there", there))
    if !walking.isEmpty { parts.append(copy.people("plan.walking", walking)) }
    return parts.joined(separator: " ")
  }
}

/* The fire */

/// The level bars of whoever is talking: honey, still (a Live Activity can't follow a voice).
private struct Levels: View {
  let height: CGFloat
  var on = true

  var body: some View {
    HStack(alignment: .bottom, spacing: height * 0.125) {
      ForEach(Array([0.45, 0.8, 0.55, 1, 0.65].enumerated()), id: \.offset) { _, level in
        RoundedRectangle(cornerRadius: 2)
          .fill(SurfacePalette.honey.opacity(on ? 1 : 0.35))
          .frame(width: height * 0.125, height: height * level)
      }
    }
    .frame(height: height, alignment: .bottom)
  }
}

private func talkingLine(_ state: FireState, _ context: Context) -> String {
  let copy = context.copy
  guard let id = state.talking, let talker = state.people.first(where: { $0.person == id }),
    let name = talker.name
  else { return copy.text("fire.quiet") }
  return copy.text("fire.talking", ["name": name])
}

private struct FireButtons: View {
  let attributes: FireAttributes
  let state: FireState
  let copy: SurfaceCopy
  let size: CGFloat
  let well: Color

  var body: some View {
    HStack(spacing: 10) {
      Button(intent: FireMuteIntent(farm: attributes.farm, mute: !state.muted)) {
        ZStack {
          Circle().fill(well)
          if let icon = SurfaceData.image(state.muted ? "icon-mic.png" : "icon-muted.png") {
            Image(uiImage: icon).resizable().frame(width: size / 2, height: size / 2)
          }
        }
        .frame(width: size, height: size)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(copy.text(state.muted ? "fire.unmute" : "fire.mute"))
      Button(intent: FireLeaveIntent(farm: attributes.farm)) {
        ZStack {
          Circle().fill(SurfacePalette.clay)
          Text(verbatim: "✕").font(.system(size: 18, weight: .bold)).foregroundStyle(.white)
        }
        .frame(width: size, height: size)
      }
      .buttonStyle(.plain)
      .accessibilityLabel(copy.text("fire.leave"))
    }
  }
}

private struct FireLockScreen: View {
  let attributes: FireAttributes
  let state: FireState
  let context: Context

  var body: some View {
    let copy = context.copy
    let title = [copy.text("fire.title"), attributes.farmName].compactMap { $0 }
      .joined(separator: " · ")
    let line = [talkingLine(state, context), state.muted ? copy.text("fire.youreMuted") : nil]
      .compactMap { $0 }.joined(separator: " · ")
    VStack(alignment: .leading, spacing: 12) {
      HStack(spacing: 12) {
        Art(name: SurfaceNames.fireRoom(season: context.season(attributes.farm)), width: 96, height: 64, radius: 14)
        VStack(alignment: .leading, spacing: 2) {
          Text(title).font(.system(size: 16, weight: .semibold)).lineLimit(1)
          Text(line).font(.system(size: 13)).foregroundStyle(Color(hex: 0xC8C2D6)).lineLimit(1)
        }
      }
      HStack {
        Heads(people: state.people, size: 28, ring: Color(hex: 0x262636))
        Spacer()
        FireButtons(attributes: attributes, state: state, copy: copy, size: 44, well: Color(hex: 0x3A3A4E))
      }
    }
    .foregroundStyle(.white)
    .padding(.horizontal, 16)
    .padding(.vertical, 14)
  }
}

/* The activity */

struct SurfaceActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SurfaceAttributes.self) { activity in
      let context = Context.load()
      Group {
        if activity.attributes.kind == "fire",
          let attributes: FireAttributes = decode(activity.attributes.json),
          let state: FireState = decode(activity.state.json)
        {
          FireLockScreen(attributes: attributes, state: state, context: context)
            .widgetURL(URL(string: SurfaceLinks.fire(attributes.link)))
        } else if let attributes: PlanDayAttributes = decode(activity.attributes.json),
          let state: PlanDayState = decode(activity.state.json)
        {
          PlanDayLockScreen(attributes: attributes, state: state, context: context)
            .widgetURL(URL(string: attributes.link))
        }
      }
      .activityBackgroundTint(Color(hex: 0x1C1A2C, opacity: 0.74))
      .activitySystemActionForegroundColor(SurfacePalette.moon)
    } dynamicIsland: { activity in
      let context = Context.load()
      if activity.attributes.kind == "fire",
        let attributes: FireAttributes = decode(activity.attributes.json),
        let state: FireState = decode(activity.state.json)
      {
        return fireIsland(attributes, state, context)
      }
      let attributes: PlanDayAttributes? = decode(activity.attributes.json)
      let state: PlanDayState = decode(activity.state.json) ?? PlanDayState(here: [], onTheWay: [])
      return planIsland(attributes, state, context)
    }
  }

  private func planIsland(_ attributes: PlanDayAttributes?, _ state: PlanDayState, _ context: Context)
    -> DynamicIsland
  {
    let first = state.onTheWay.first ?? state.here.first
    let onTheWay = context.copy.text("plan.onTheWay", count: state.onTheWay.count)
    return DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        if let first { Head(person: first, size: 26) }
      }
      DynamicIslandExpandedRegion(.trailing) {
        Text(onTheWay).font(.system(size: 13, weight: .semibold)).foregroundStyle(SurfacePalette.honey)
      }
      DynamicIslandExpandedRegion(.bottom) {
        if let attributes {
          PlanDayLockScreen(attributes: attributes, state: state, context: context)
        }
      }
    } compactLeading: {
      if let first { Head(person: first, size: 26) }
    } compactTrailing: {
      Text(onTheWay).font(.system(size: 13, weight: .semibold)).foregroundStyle(SurfacePalette.honey)
    } minimal: {
      if let first { Head(person: first, size: 24) }
    }
    .widgetURL(attributes.flatMap { URL(string: $0.link) })
  }

  private func fireIsland(_ attributes: FireAttributes, _ state: FireState, _ context: Context)
    -> DynamicIsland
  {
    let copy = context.copy
    let season = context.season(attributes.farm)
    let me = state.people.first { $0.name == context.you }
    let youTalking = me != nil && state.talking == me?.person
    let subtitle = [attributes.farmName, talkingLine(state, context)].compactMap { $0 }
      .joined(separator: " · ")
    return DynamicIsland {
      DynamicIslandExpandedRegion(.leading) {
        Art(name: SurfaceNames.smallFire(season: season), width: 48, height: 48, radius: 14)
      }
      DynamicIslandExpandedRegion(.center) {
        VStack(alignment: .leading, spacing: 2) {
          Text(copy.text("fire.title")).font(.system(size: 16, weight: .semibold))
          Text(subtitle).font(.system(size: 13)).foregroundStyle(Color(hex: 0xA9A3B8)).lineLimit(1)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      DynamicIslandExpandedRegion(.trailing) {
        Levels(height: 20, on: state.talking != nil)
      }
      DynamicIslandExpandedRegion(.bottom) {
        HStack {
          Heads(people: state.people, size: 30)
          Spacer()
          FireButtons(attributes: attributes, state: state, copy: copy, size: 48, well: Color(hex: 0x2C2C2E))
        }
      }
    } compactLeading: {
      if youTalking, let me {
        Head(person: me, size: 24)
      } else {
        Art(name: SurfaceNames.smallFire(season: season), width: 24, height: 24, radius: 12)
      }
    } compactTrailing: {
      HStack(spacing: 6) {
        if youTalking {
          Text(copy.text("you")).font(.system(size: 13, weight: .semibold))
            .foregroundStyle(SurfacePalette.honey)
        }
        Levels(height: 14, on: state.talking != nil)
      }
    } minimal: {
      Art(name: SurfaceNames.smallFire(season: season), width: 24, height: 24, radius: 12)
    }
    .widgetURL(URL(string: SurfaceLinks.fire(attributes.link)))
  }
}
