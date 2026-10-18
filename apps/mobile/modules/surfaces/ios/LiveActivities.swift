import ActivityKit
import Foundation

/// Starting, updating and ending the Live Activities, and their push tokens. The app decides
/// when; this only does it.
enum LiveActivities {
  static let kinds: Set<String> = ["plan_day", "fire"]

  static var enabled: Bool { ActivityAuthorizationInfo().areActivitiesEnabled }

  static func describe(_ activity: Activity<SurfaceAttributes>) -> [String: String] {
    [
      "id": activity.id,
      "kind": activity.attributes.kind,
      "key": activity.attributes.key,
      "stateJson": activity.content.state.json,
    ]
  }

  static func list() -> [[String: String]] {
    Activity<SurfaceAttributes>.activities.map(describe)
  }

  /// Starts an activity while the app is in the foreground; nil when iOS refuses one. With `push`,
  /// the activity gets an update token (`onActivityToken`) the server can move it along with.
  static func start(
    kind: String, key: String, attributesJson: String, stateJson: String, push: Bool
  ) -> Activity<SurfaceAttributes>? {
    guard kinds.contains(kind), enabled else { return nil }
    let content = ActivityContent(
      state: SurfaceAttributes.ContentState(json: stateJson), staleDate: nil)
    return try? Activity.request(
      attributes: SurfaceAttributes(kind: kind, key: key, json: attributesJson),
      content: content, pushType: push ? .token : nil)
  }

  static func update(id: String, stateJson: String) async {
    guard let activity = find(id) else { return }
    await activity.update(
      ActivityContent(state: SurfaceAttributes.ContentState(json: stateJson), staleDate: nil))
  }

  /// Ends at once, or after showing a last state when one is given.
  static func end(id: String, finalStateJson: String?) async {
    guard let activity = find(id) else { return }
    let content = finalStateJson.map {
      ActivityContent(state: SurfaceAttributes.ContentState(json: $0), staleDate: nil)
    }
    await activity.end(content, dismissalPolicy: content == nil ? .immediate : .default)
  }

  private static func find(_ id: String) -> Activity<SurfaceAttributes>? {
    Activity<SurfaceAttributes>.activities.first { $0.id == id }
  }
}

/// Hex, as the API takes push tokens (`ActivityPushToken`).
extension Data {
  var hex: String { map { String(format: "%02x", $0) }.joined() }
}

/// Follows every activity's update token and state, and the device's push-to-start token, for as
/// long as the module lives.
final class ActivityWatcher {
  private var tasks: [String: Task<Void, Never>] = [:]
  private var root: [Task<Void, Never>] = []
  private let send: (String, [String: Any]) -> Void

  init(send: @escaping (String, [String: Any]) -> Void) {
    self.send = send
  }

  func start() {
    for activity in Activity<SurfaceAttributes>.activities { watch(activity) }
    root.append(
      Task { [weak self] in
        // Activities the server started with the push-to-start token appear here too.
        for await activity in Activity<SurfaceAttributes>.activityUpdates {
          self?.watch(activity)
        }
      })
    if #available(iOS 17.2, *) {
      root.append(
        Task { [weak self] in
          for await token in Activity<SurfaceAttributes>.pushToStartTokenUpdates {
            self?.send("onPushToStartToken", ["token": token.hex])
          }
        })
    }
  }

  func stop() {
    root.forEach { $0.cancel() }
    tasks.values.forEach { $0.cancel() }
    root = []
    tasks = [:]
  }

  func watch(_ activity: Activity<SurfaceAttributes>) {
    guard tasks[activity.id] == nil else { return }
    let base = LiveActivities.describe(activity)
    tasks[activity.id] = Task { [weak self] in
      await withTaskGroup(of: Void.self) { group in
        group.addTask {
          for await token in activity.pushTokenUpdates {
            self?.send("onActivityToken", base.merging(["token": token.hex]) { $1 })
          }
        }
        group.addTask {
          for await state in activity.activityStateUpdates {
            if state == .ended || state == .dismissed {
              self?.send("onActivityEnded", base)
              return
            }
          }
        }
      }
    }
  }
}
