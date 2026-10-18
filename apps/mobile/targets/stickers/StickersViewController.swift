import Messages
import UIKit

/// The sticker drawer in Messages: every sticker file the app left in `surfaces/stickers/`
/// (PNG, APNG or GIF), in file-name order. It reads the folder each time the drawer opens, so a
/// new outfit shows up without the extension changing.
final class StickersViewController: MSMessagesAppViewController {
  private let browser = MSStickerBrowserViewController(stickerSize: .regular)
  private var stickers: [MSSticker] = []

  override func viewDidLoad() {
    super.viewDidLoad()
    browser.stickerBrowserView.dataSource = self
    addChild(browser)
    browser.view.frame = view.bounds
    browser.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(browser.view)
    browser.didMove(toParent: self)
  }

  override func willBecomeActive(with conversation: MSConversation) {
    super.willBecomeActive(with: conversation)
    stickers = Self.load()
    browser.stickerBrowserView.reloadData()
  }

  private static func load() -> [MSSticker] {
    guard let folder = GroupFiles.url(GroupFiles.stickers),
      let files = try? FileManager.default.contentsOfDirectory(
        at: folder, includingPropertiesForKeys: nil)
    else { return [] }
    return
      files
      .filter { ["png", "apng", "gif"].contains($0.pathExtension.lowercased()) }
      .sorted { $0.lastPathComponent < $1.lastPathComponent }
      .compactMap { try? MSSticker(contentsOfFileURL: $0, localizedDescription: "") }
  }
}

extension StickersViewController: MSStickerBrowserViewDataSource {
  func numberOfStickers(in stickerBrowserView: MSStickerBrowserView) -> Int {
    stickers.count
  }

  func stickerBrowserView(_ stickerBrowserView: MSStickerBrowserView, stickerAt index: Int)
    -> MSSticker
  {
    stickers[index]
  }
}
