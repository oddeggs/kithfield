import AVFAudio
import ExpoModulesCore
import UIKit

/// The app side of the native surfaces. Files for the extensions go through `expo-file-system`
/// (`Paths.appleSharedContainers`) and widget reloads through `@bacons/apple-targets`
/// (`ExtensionStorage.reloadWidget`); this adds what neither does: Live Activities and their push
/// tokens, the fire activity's buttons, where the fire sounds, and the pasteboard.
public class SurfacesModule: Module {
  private var watcher: ActivityWatcher?
  private var observers: [NSObjectProtocol] = []

  public func definition() -> ModuleDefinition {
    Name("Surfaces")

    Events(
      "onActivityToken", "onPushToStartToken", "onActivityEnded", "onActivityAction",
      "onAudioRoute")

    OnStartObserving {
      self.startWatching()
    }

    OnStopObserving {
      self.stopWatching()
    }

    Function("activitiesEnabled") { () -> Bool in
      LiveActivities.enabled
    }

    AsyncFunction("listActivities") { () -> [[String: String]] in
      LiveActivities.list()
    }

    AsyncFunction("startActivity") {
      (kind: String, key: String, attributesJson: String, stateJson: String, push: Bool?)
        -> String? in
      let activity = LiveActivities.start(
        kind: kind, key: key, attributesJson: attributesJson, stateJson: stateJson,
        push: push ?? false)
      if let activity { self.watcher?.watch(activity) }
      return activity?.id
    }

    AsyncFunction("updateActivity") { (id: String, stateJson: String) in
      await LiveActivities.update(id: id, stateJson: stateJson)
    }

    AsyncFunction("endActivity") { (id: String, finalStateJson: String?) in
      await LiveActivities.end(id: id, finalStateJson: finalStateJson)
    }

    Function("audioRoute") { () -> [String: Any] in
      AudioRoutes.current()
    }

    AsyncFunction("setAudioRoute") { (id: String) in
      try AudioRoutes.choose(id)
    }

    AsyncFunction("showAirPlayPicker") {
      await AudioRoutes.showAirPlayPicker()
    }

    /// Puts data of one type on the general pasteboard for a while, on this device only: how a
    /// sticker pack reaches WhatsApp (`net.whatsapp.third-party.sticker-pack`).
    AsyncFunction("copyToPasteboard") { (type: String, base64: String, seconds: Double) in
      guard let data = Data(base64Encoded: base64) else {
        throw Exception(name: "BadData", description: "The data is not base64")
      }
      UIPasteboard.general.setItems(
        [[type: data]],
        options: [.localOnly: true, .expirationDate: Date(timeIntervalSinceNow: seconds)])
    }.runOnQueue(.main)
  }

  private func startWatching() {
    guard watcher == nil else { return }
    let watcher = ActivityWatcher { [weak self] name, body in self?.sendEvent(name, body) }
    watcher.start()
    self.watcher = watcher
    let center = NotificationCenter.default
    observers.append(
      center.addObserver(
        forName: Notification.Name("KithfieldFireActivityAction"), object: nil, queue: .main
      ) { [weak self] note in
        guard let action = note.userInfo?["action"] as? String,
          let farm = note.userInfo?["farm"] as? String
        else { return }
        self?.sendEvent("onActivityAction", ["action": action, "farm": farm])
      })
    observers.append(
      center.addObserver(
        forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main
      ) { [weak self] note in
        let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt ?? 0
        var body = AudioRoutes.current()
        body["reason"] = AudioRoutes.reason(raw)
        self?.sendEvent("onAudioRoute", body)
      })
  }

  private func stopWatching() {
    watcher?.stop()
    watcher = nil
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers = []
  }
}
