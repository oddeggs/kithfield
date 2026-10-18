import UserNotifications

/// Puts a still on a push before iOS shows it, from the images the app last wrote for its
/// surfaces: a sprouted seed for a plan (`PlanPushData.seed`), otherwise the farm it names
/// (`PushData.farm`), by day or by night at the phone's hour. A push it can't place goes out as
/// it came. Pushes reach it with `mutable-content`.
final class NotificationService: UNNotificationServiceExtension {
  private var deliver: ((UNNotificationContent) -> Void)?
  private var content: UNMutableNotificationContent?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    deliver = contentHandler
    guard let content = request.content.mutableCopy() as? UNMutableNotificationContent else {
      contentHandler(request.content)
      return
    }
    self.content = content
    if let name = Self.still(for: content.userInfo, at: Date()),
      let attachment = Self.attachment(name)
    {
      content.attachments = [attachment]
    }
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let content { deliver(content) }
  }

  /// The push's `data`: under `body` when sent through Expo, at the top level from APNs.
  static func data(_ userInfo: [AnyHashable: Any]) -> [String: Any] {
    userInfo["body"] as? [String: Any] ?? userInfo as? [String: Any] ?? [:]
  }

  /// Night from 7pm to 7am, as the farm's sky turns.
  static func isNight(_ date: Date) -> Bool {
    let hour = Calendar.current.component(.hour, from: date)
    return hour >= 19 || hour < 7
  }

  /// The image a push gets: the seed for a plan, the farm's still otherwise.
  static func still(for userInfo: [AnyHashable: Any], at date: Date) -> String? {
    let data = data(userInfo)
    if data["seed"] != nil, SurfaceData.image(SurfaceNames.seed) != nil {
      return SurfaceNames.seed
    }
    guard let farmId = data["farm"] as? String,
      let farm = SurfaceData.read()?.farms.first(where: { $0.farm == farmId })
    else { return nil }
    return isNight(date) ? farm.images.night : farm.images.day
  }

  private static func attachment(_ name: String) -> UNNotificationAttachment? {
    guard let source = GroupFiles.url(GroupFiles.images + name) else { return nil }
    // iOS moves an attachment's file, so it gets a copy.
    let copy = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".png")
    guard (try? FileManager.default.copyItem(at: source, to: copy)) != nil else { return nil }
    return try? UNNotificationAttachment(identifier: "still", url: copy)
  }
}
