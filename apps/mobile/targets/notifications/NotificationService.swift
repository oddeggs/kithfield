import UserNotifications

/// Adds the farm's still to a push that names a farm (`PushData.farm`), from the images the app
/// last wrote for its widgets. A push it can't place goes out as it came.
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
    if let attachment = Self.farmStill(for: content.userInfo) {
      content.attachments = [attachment]
    }
    contentHandler(content)
  }

  override func serviceExtensionTimeWillExpire() {
    if let deliver, let content { deliver(content) }
  }

  /// The push's `data` sits under `body` when sent through Expo, at the top level from APNs.
  private static func farmStill(for userInfo: [AnyHashable: Any]) -> UNNotificationAttachment? {
    let data = userInfo["body"] as? [String: Any] ?? userInfo as? [String: Any] ?? [:]
    guard let farmId = data["farm"] as? String,
      let farm = SurfaceData.read()?.farms.first(where: { $0.farm == farmId }),
      let source = GroupFiles.url(GroupFiles.images + farm.images.day)
    else { return nil }
    // iOS moves an attachment's file, so it gets a copy.
    let copy = FileManager.default.temporaryDirectory.appendingPathComponent(
      UUID().uuidString + ".png")
    guard (try? FileManager.default.copyItem(at: source, to: copy)) != nil else { return nil }
    return try? UNNotificationAttachment(identifier: "farm", url: copy)
  }
}
