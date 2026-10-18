import Messages
import OSLog
import UIKit

private let log = Logger(subsystem: "com.kithfield.stickers", category: "drawer")

/// The sticker drawer in Messages: the stickers the app left in `surfaces/stickers/` (animated
/// PNGs), in the order and with the words its `manifest.json` gives. It reads the folder each
/// time the drawer opens, so a new outfit shows up without the extension changing.
final class StickersViewController: MSMessagesAppViewController {
  private let browser = StickerBrowser(stickerSize: .small)

  override func viewDidLoad() {
    super.viewDidLoad()
    addChild(browser)
    browser.view.frame = view.bounds
    browser.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(browser.view)
    browser.didMove(toParent: self)
  }

  override func willBecomeActive(with conversation: MSConversation) {
    super.willBecomeActive(with: conversation)
    browser.stickers = Self.load()
    browser.stickerBrowserView.reloadData()
  }

  /// `manifest.json`, written by the app after the stickers: each file in order, with its words
  /// in the reader's language for VoiceOver.
  private struct Manifest: Decodable {
    struct Entry: Decodable {
      let file: String
      let label: String
    }
    let stickers: [Entry]
  }

  private static func load() -> [MSSticker] {
    guard let folder = GroupFiles.url(GroupFiles.stickers),
      let files = try? FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
    else {
      log.notice("No sticker folder in \(GroupFiles.groupId, privacy: .public)")
      return []
    }
    let entries: [(URL, String)]
    if let data = try? Data(contentsOf: folder.appendingPathComponent("manifest.json")),
      let manifest = try? JSONDecoder().decode(Manifest.self, from: data)
    {
      entries = manifest.stickers.map { (folder.appendingPathComponent($0.file), $0.label) }
    } else {
      // Before the app has written a manifest: every sticker file, by name.
      entries =
        files
        .filter { ["png", "apng", "gif"].contains($0.pathExtension.lowercased()) }
        .sorted { $0.lastPathComponent < $1.lastPathComponent }
        .map { ($0, $0.deletingPathExtension().lastPathComponent) }
    }
    let stickers = entries.compactMap { file, label -> MSSticker? in
      guard FileManager.default.fileExists(atPath: file.path) else { return nil }
      do {
        return try MSSticker(contentsOfFileURL: file, localizedDescription: label)
      } catch {
        log.error("Sticker \(file.lastPathComponent, privacy: .public) refused: \(error)")
        return nil
      }
    }
    log.notice("Offering \(stickers.count) stickers")
    return stickers
  }
}

/// The system sticker browser, fed from the App Group instead of the extension's bundle.
final class StickerBrowser: MSStickerBrowserViewController {
  var stickers: [MSSticker] = []

  override func numberOfStickers(in stickerBrowserView: MSStickerBrowserView) -> Int {
    stickers.count
  }

  override func stickerBrowserView(_ stickerBrowserView: MSStickerBrowserView, stickerAt index: Int)
    -> MSSticker
  {
    stickers[index]
  }
}
