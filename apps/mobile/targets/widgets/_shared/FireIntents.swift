import AppIntents
import Foundation

/// The fire's Live Activity buttons: mute and leave without opening the app. A Live Activity's
/// intent runs in the app's process (which the fire keeps running with its audio), so it hands
/// the tap to the app's `Surfaces` module, which tells the fire room's JavaScript.
/// Linked into both the app and the widget extension, as App Intents need.
enum FireActivityActions {
  /// The notification the `Surfaces` module listens for; `userInfo` has `action` and `farm`.
  static let notification = Notification.Name("KithfieldFireActivityAction")

  static func post(_ action: String, farm: String) {
    NotificationCenter.default.post(
      name: notification, object: nil, userInfo: ["action": action, "farm": farm])
  }
}

struct FireMuteIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "surfaces.native.fire.mute"
  static let isDiscoverable = false

  @Parameter(title: "farm") var farm: String
  @Parameter(title: "mute") var mute: Bool

  init() {}

  init(farm: String, mute: Bool) {
    self.farm = farm
    self.mute = mute
  }

  func perform() async throws -> some IntentResult {
    FireActivityActions.post(mute ? "mute" : "unmute", farm: farm)
    return .result()
  }
}

struct FireLeaveIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "surfaces.native.fire.leave"
  static let isDiscoverable = false

  @Parameter(title: "farm") var farm: String

  init() {}

  init(farm: String) {
    self.farm = farm
  }

  func perform() async throws -> some IntentResult {
    FireActivityActions.post("leave", farm: farm)
    return .result()
  }
}
