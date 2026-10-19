import AVFAudio
import AVKit
import UIKit

/// Where the fire sounds: the outputs the room can use and the one in use, and word when it
/// changes (AirPods put in or taken out). The fire room's call keeps its own audio session
/// (LiveKit); this only reads it and moves the route.
enum AudioRoutes {
  static var session: AVAudioSession { AVAudioSession.sharedInstance() }

  /// `bluetooth` (AirPods and other headsets, with their mic), `wired`, `iphone` (the earpiece),
  /// `speaker`, `airplay` (listen only).
  static func kind(of port: AVAudioSession.Port) -> String {
    switch port {
    case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: return "bluetooth"
    case .headphones, .headsetMic, .usbAudio: return "wired"
    case .builtInSpeaker: return "speaker"
    case .airPlay: return "airplay"
    default: return "iphone"
    }
  }

  static func current() -> [String: Any] {
    let route = session.currentRoute
    let output = route.outputs.first
    let input = route.inputs.first
    var options: [[String: String]] = (session.availableInputs ?? []).compactMap { input in
      let kind = kind(of: input.portType)
      guard kind == "bluetooth" || kind == "wired" else { return nil }
      return ["id": input.uid, "kind": kind, "name": input.portName]
    }
    options.append(["id": "iphone", "kind": "iphone", "name": ""])
    options.append(["id": "speaker", "kind": "speaker", "name": ""])
    return [
      "output": [
        "kind": output.map { kind(of: $0.portType) } ?? "iphone",
        "name": output?.portName ?? "",
      ],
      "input": input.map { ["kind": kind(of: $0.portType), "name": $0.portName] } as Any,
      "options": options,
    ]
  }

  /// Sends the room to a headset by its input id, to the earpiece, or to the speaker.
  static func choose(_ id: String) throws {
    switch id {
    case "speaker":
      try session.overrideOutputAudioPort(.speaker)
    case "iphone":
      try session.overrideOutputAudioPort(.none)
      if let mic = session.availableInputs?.first(where: { $0.portType == .builtInMic }) {
        try session.setPreferredInput(mic)
      }
    default:
      try session.overrideOutputAudioPort(.none)
      if let input = session.availableInputs?.first(where: { $0.uid == id }) {
        try session.setPreferredInput(input)
      }
    }
  }

  /// The system's AirPlay picker, for outputs only the system can reach.
  @MainActor
  static func showAirPlayPicker() {
    let picker = AVRoutePickerView(frame: .zero)
    guard let window = UIApplication.shared.connectedScenes
      .compactMap({ ($0 as? UIWindowScene)?.keyWindow }).first
    else { return }
    picker.isHidden = true
    window.addSubview(picker)
    picker.subviews.compactMap { $0 as? UIButton }.first?.sendActions(for: .touchUpInside)
    DispatchQueue.main.asyncAfter(deadline: .now() + 1) { picker.removeFromSuperview() }
  }

  /// Why the route changed, as the app reads it: `gone` when a headset went away (an AirPod
  /// taken out, which pauses the mic), `new` when one arrived, `other` otherwise.
  static func reason(_ raw: UInt) -> String {
    switch AVAudioSession.RouteChangeReason(rawValue: raw) {
    case .oldDeviceUnavailable: return "gone"
    case .newDeviceAvailable: return "new"
    default: return "other"
    }
  }
}
