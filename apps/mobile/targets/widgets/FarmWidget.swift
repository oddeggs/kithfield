import SwiftUI
import WidgetKit

/// The farm at one moment: which windows are lit then, and whether the fire is.
struct FarmEntry: TimelineEntry {
  let date: Date
  let farm: SurfaceFarm?
  let copy: SurfaceCopy
  let lit: Set<String>
}

/// Static per entry: an entry at now, then one each time a lit window goes dark (a window is lit
/// for three hours after its person opened the farm). The app reloads the timeline when it
/// rewrites the file (farm activity, at most every 15 minutes, and at once when the fire is lit
/// or goes out).
struct FarmTimeline: TimelineProvider {
  func placeholder(in context: Context) -> FarmEntry {
    FarmEntry(date: .now, farm: nil, copy: SurfaceCopy(lang: nil), lit: [])
  }

  func getSnapshot(in context: Context, completion: @escaping (FarmEntry) -> Void) {
    completion(entries(from: .now).first ?? placeholder(in: context))
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<FarmEntry>) -> Void) {
    let now = Date.now
    let all = entries(from: now)
    // The next plan's day passes too: look again within the hour.
    completion(Timeline(entries: all, policy: .after(now.addingTimeInterval(60 * 60))))
  }

  private func entries(from now: Date) -> [FarmEntry] {
    let data = SurfaceData.read()
    let copy = SurfaceCopy(lang: data?.lang)
    guard let farm = data?.farm(nil) else {
      return [FarmEntry(date: now, farm: nil, copy: copy, lit: [])]
    }
    let dims = farm.critters.compactMap { $0.dims(after: now) }.sorted()
    return ([now] + dims).map { date in
      FarmEntry(date: date, farm: farm, copy: copy, lit: farm.litKinds(at: date))
    }
  }
}

/// White text over the night art, as the design sets it.
private let paper = SurfacePalette.moon

struct FarmWidgetView: View {
  let entry: FarmEntry
  @Environment(\.widgetFamily) private var family

  var body: some View {
    Group {
      if let farm = entry.farm {
        switch family {
        case .systemSmall: SmallFarm(farm: farm, copy: entry.copy)
        case .systemLarge: LargeFarm(farm: farm, copy: entry.copy, lit: entry.lit, now: entry.date)
        default: MediumFarm(farm: farm, copy: entry.copy, lit: entry.lit, now: entry.date)
        }
      } else {
        Text(entry.copy.text("widget.empty"))
          .font(.system(size: 13, weight: .medium))
          .foregroundStyle(paper)
          .multilineTextAlignment(.center)
          .padding(16)
      }
    }
    .environment(\.locale, entry.copy.locale)
    .containerBackground(for: .widget) { SurfacePalette.panel }
    .widgetURL(entry.farm.flatMap { URL(string: $0.fire == nil ? $0.link : fireLink($0)) })
  }

  /// The fire room, while the fire is lit.
  private func fireLink(_ farm: SurfaceFarm) -> String { SurfaceLinks.fire(farm.link) }
}

/// The art, filling the widget; desaturated on a tinted home screen.
struct Still: View {
  let name: String
  var fallback: String?

  var body: some View {
    if let image = SurfaceData.image(name) ?? fallback.flatMap(SurfaceData.image) {
      Image(uiImage: image).resizable().desaturatedWhenTinted().scaledToFill()
    } else {
      SurfacePalette.panel
    }
  }
}

/// The label in the top corner: the farm's name, small capitals.
private struct Kicker: View {
  let text: String
  var size: CGFloat = 12
  var opacity: Double = 0.8

  var body: some View {
    Text(text.uppercased())
      .font(.system(size: size, weight: .semibold))
      .tracking(size * 0.02)
      .foregroundStyle(paper.opacity(opacity))
      .lineLimit(1)
  }
}

/// Small: the fire, or the next plan, over the little fire.
struct SmallFarm: View {
  let farm: SurfaceFarm
  let copy: SurfaceCopy

  var body: some View {
    ZStack(alignment: .topLeading) {
      Still(name: SurfaceNames.smallFire(season: farm.season.season), fallback: farm.images.night)
      VStack(alignment: .leading, spacing: 4) {
        Kicker(text: kicker, size: 11, opacity: 0.75)
        Text(title)
          .font(SurfaceFonts.gaegu(17))
          .lineSpacing(17 * 0.05)
          .foregroundStyle(paper)
          .lineLimit(2)
      }
      .padding(12)
    }
  }

  private var kicker: String {
    if farm.fire != nil { return copy.text("widget.byTheFireLabel") }
    guard let plan = farm.nextPlan else { return farm.title }
    return PlanTime.label(date: plan.date, from: plan.from, copy: copy)
  }

  private var title: String {
    if let fire = farm.fire {
      let names = FireNames.of(fire, copy: copy)
      return names.isEmpty ? copy.text("widget.fireLitTitle") : copy.list(names)
    }
    return farm.nextPlan?.title ?? copy.text("widget.noPlan")
  }
}

/// Who is by the fire, as the widgets name them: the first two, friends by name and the phone's
/// own person as "you" (the app lists them last).
enum FireNames {
  static func of(_ fire: SurfaceFarm.Fire, copy: SurfaceCopy) -> [String] {
    let me = SurfaceData.me()
    return Array(fire.people.compactMap { $0.person == me ? copy.text("you") : $0.name }.prefix(2))
  }

  /// "Pip and Bea are by the fire", "You're by the fire", or the fire alone when nobody is known.
  static func line(_ fire: SurfaceFarm.Fire, copy: SurfaceCopy) -> String {
    let names = of(fire, copy: copy)
    if names.isEmpty { return copy.text("widget.fireLitTitle") }
    if fire.people.count == 1, fire.people.first?.person == SurfaceData.me() {
      return copy.text("widget.youByTheFire")
    }
    return copy.people("widget.byTheFire", names)
  }
}

/// "SATURDAY · 4PM": a plan's day and hour, in the person's language.
enum PlanTime {
  static func day(_ date: String) -> Date? {
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd"
    return parser.date(from: date)
  }

  static func start(date: String, from: String?) -> Date? {
    let parser = DateFormatter()
    parser.locale = Locale(identifier: "en_US_POSIX")
    parser.dateFormat = "yyyy-MM-dd HH:mm"
    return parser.date(from: "\(date) \(from ?? "00:00")")
  }

  static func hour(_ from: String, copy: SurfaceCopy) -> String {
    guard let time = start(date: "2000-01-01", from: from) else { return from }
    let format = DateFormatter()
    format.locale = copy.locale
    let whole = Calendar.current.component(.minute, from: time) == 0
    format.dateFormat = copy.lang == "vi" ? "H:mm" : (whole ? "ha" : "h:mma")
    return format.string(from: time).lowercased()
  }

  static func label(date: String, from: String?, copy: SurfaceCopy) -> String {
    guard let day = day(date) else { return date }
    let format = DateFormatter()
    format.locale = copy.locale
    format.dateFormat = "EEEE"
    let weekday = format.string(from: day)
    guard let from else { return weekday }
    return "\(weekday) · \(hour(from, copy: copy))"
  }
}

/// Who is up and who is asleep, by their windows.
private func upAndAsleep(_ farm: SurfaceFarm, now: Date, copy: SurfaceCopy) -> (String, String?) {
  let up = farm.critters.filter { $0.lit(at: now) }.compactMap(\.name)
  let asleep = farm.critters.filter { !$0.lit(at: now) }.compactMap(\.name)
  if up.isEmpty { return (copy.text("widget.allAsleep"), nil) }
  return (copy.people("widget.up", up), asleep.isEmpty ? nil : copy.people("widget.asleep", asleep))
}

/// Medium: the farm at night with its lit windows, or by the fire while it's lit.
struct MediumFarm: View {
  let farm: SurfaceFarm
  let copy: SurfaceCopy
  let lit: Set<String>
  let now: Date

  var body: some View {
    GeometryReader { size in
      ZStack(alignment: .topLeading) {
        if farm.fire != nil {
          Still(name: SurfaceNames.mediumFire(farm: farm.farm), fallback: farm.images.night)
        } else {
          Still(name: SurfaceNames.medium(farm: farm.farm, lit: lit), fallback: farm.images.night)
          Windows(farm: farm, size: size.size, top: 0.48)
        }
        Kicker(text: farm.title).padding(.leading, 14).padding(.top, 12)
        if farm.fire != nil {
          FireChip(copy: copy)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 14).padding(.top, 12)
        }
        Caption(lines: lines)
          .frame(maxHeight: .infinity, alignment: .bottom)
          .padding(.leading, 14).padding(.bottom, 12)
      }
    }
  }

  private var lines: (String, String?) {
    if let fire = farm.fire {
      return (FireNames.line(fire, copy: copy), copy.text("widget.comeSit"))
    }
    return upAndAsleep(farm, now: now, copy: copy)
  }
}

/// Large: the farm, taller, with who's up beneath it.
struct LargeFarm: View {
  let farm: SurfaceFarm
  let copy: SurfaceCopy
  let lit: Set<String>
  let now: Date

  var body: some View {
    GeometryReader { size in
      ZStack(alignment: .topLeading) {
        Still(name: SurfaceNames.large(farm: farm.farm, lit: lit), fallback: farm.images.night)
        Windows(farm: farm, size: size.size, top: 0.48)
        Kicker(text: farm.title).padding(.leading, 14).padding(.top, 12)
        if farm.fire != nil {
          FireChip(copy: copy)
            .frame(maxWidth: .infinity, alignment: .trailing)
            .padding(.trailing, 14).padding(.top, 12)
        }
        VStack(alignment: .leading, spacing: 8) {
          Caption(lines: upAndAsleep(farm, now: now, copy: copy))
          if let fire = farm.fire {
            Text(FireNames.line(fire, copy: copy))
              .font(.system(size: 12))
              .foregroundStyle(SurfacePalette.honey)
          } else if let plan = farm.nextPlan {
            Text("\(PlanTime.label(date: plan.date, from: plan.from, copy: copy)) · \(plan.title)")
              .font(.system(size: 12))
              .foregroundStyle(paper.opacity(0.75))
              .lineLimit(1)
          }
        }
        .frame(maxHeight: .infinity, alignment: .bottom)
        .padding(.leading, 14).padding(.bottom, 14)
      }
    }
  }
}

/// The two lines at the bottom: Gaegu over the system face.
private struct Caption: View {
  let lines: (String, String?)

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      Text(lines.0).font(SurfaceFonts.gaegu(19)).foregroundStyle(paper).lineLimit(1)
        .minimumScaleFactor(0.8)
      if let second = lines.1 {
        Text(second).font(.system(size: 12)).foregroundStyle(paper.opacity(0.75)).lineLimit(1)
      }
    }
  }
}

/// "fire's lit", with the lantern.
private struct FireChip: View {
  let copy: SurfaceCopy

  var body: some View {
    HStack(spacing: 6) {
      if let lantern = SurfaceData.image("icon-lantern.png") {
        Image(uiImage: lantern).resizable().frame(width: 16, height: 16)
      }
      Text(copy.text("widget.firesLit"))
        .font(.system(size: 12, weight: .semibold))
        .foregroundStyle(Color(hex: 0xFFD98A))
    }
    .padding(.horizontal, 10)
    .frame(height: 26)
    .background(Capsule().fill(Color.black.opacity(0.35)))
  }
}

/// Each friend's window opens their critter card. Where the widget scene puts each home, as
/// fractions of its width (`S.widget` in the art), and the owl's hollow in the tree.
private struct Windows: View {
  let farm: SurfaceFarm
  let size: CGSize
  let top: CGFloat

  private static let homes: [String: CGFloat] = [
    "rabbit": 0.1, "hedgehog": 0.29, "frog": 0.48, "mole": 0.64, "sheep": 0.8, "owl": 0.95,
  ]

  var body: some View {
    ForEach(targets, id: \.0) { species, link, x in
      if let url = URL(string: link) {
        Link(destination: url) {
          Color.clear.contentShape(Rectangle())
        }
        .frame(width: size.width * 0.14, height: size.height * 0.36)
        .position(x: size.width * x, y: size.height * top)
      }
    }
  }

  /// The first critter of each kind that has a home in the scene.
  private var targets: [(String, String, CGFloat)] {
    var seen = Set<String>()
    return farm.critters.compactMap { critter in
      let species = critter.critter.species
      guard let x = Self.homes[species], !seen.contains(species) else { return nil }
      seen.insert(species)
      return (species, critter.link, x)
    }
  }
}

struct FarmWidget: Widget {
  var body: some WidgetConfiguration {
    let copy = SurfaceCopy(lang: SurfaceData.read()?.lang)
    return StaticConfiguration(kind: "farm", provider: FarmTimeline()) { entry in
      FarmWidgetView(entry: entry)
    }
    .configurationDisplayName(copy.text("widget.name"))
    .description(copy.text("widget.description"))
    .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    .contentMarginsDisabled()
  }
}

extension Image {
  /// On a tinted home screen the art keeps its shapes in the tint, not flat colour.
  @ViewBuilder func desaturatedWhenTinted() -> some View {
    if #available(iOSApplicationExtension 18.0, *) {
      widgetAccentedRenderingMode(.desaturated)
    } else {
      self
    }
  }
}
