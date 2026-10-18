import Messages
import OSLog
import UIKit

private let log = Logger(subsystem: "com.kithfield.stickers", category: "drawer")

/// The sticker drawer in Messages: every sticker file the app left in `surfaces/stickers/`
/// (PNG, APNG or GIF), in file-name order. It reads the folder each time the drawer opens, so a
/// new outfit shows up without the extension changing.
final class StickersViewController: MSMessagesAppViewController {
  private let browser = StickerBrowser(stickerSize: .regular)

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

  private static func load() -> [MSSticker] {
    guard let folder = GroupFiles.url(GroupFiles.stickers),
      let files = try? FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
    else {
      log.notice("No sticker folder in \(GroupFiles.groupId, privacy: .public)")
      return []
    }
    let stickers =
      files
      .filter { ["png", "apng", "gif"].contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
      .compactMap { file -> MSSticker? in
        do {
          // VoiceOver reads the file's name until the app writes each sticker's caption.
          return try MSSticker(
            contentsOfFileURL: file,
            localizedDescription: file.deletingPathExtension().lastPathComponent)
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
