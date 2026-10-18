import ExpoModulesCore
import UIKit

/// The app side of the native surfaces. Files for the extensions go through `expo-file-system`
/// (`Paths.appleSharedContainers`) and widget reloads through `@bacons/apple-targets`
/// (`ExtensionStorage.reloadWidget`); this adds what neither does.
public class SurfacesModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Surfaces")

    Function("activitiesEnabled") { () -> Bool in
      LiveActivities.enabled
    }

    AsyncFunction("listActivities") { () -> [[String: String]] in
      LiveActivities.list()
    }

    AsyncFunction("startActivity") {
      (kind: String, key: String, attributesJson: String, stateJson: String) -> String? in
      LiveActivities.start(
        kind: kind, key: key, attributesJson: attributesJson, stateJson: stateJson)
    }

    AsyncFunction("updateActivity") { (id: String, stateJson: String) in
      await LiveActivities.update(id: id, stateJson: stateJson)
    }

    AsyncFunction("endActivity") { (id: String, finalStateJson: String?) in
      await LiveActivities.end(id: id, finalStateJson: finalStateJson)
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
}
