import SwiftUI
import UIKit
import UniformTypeIdentifiers

/// The share sheet's Kithfield entry: up to 10 photos, videos or files, a web link, or text,
/// sent to one or more farms and visits. The extension doesn't upload: it copies what was shared
/// into the App Group as one `ShareDraft` per farm (`surfaces/share-outbox/<opId>.json`, with the
/// files beside it), then opens the app, which sends them through its own queue.
final class ShareViewController: UIViewController {
  private let model = ShareModel()

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    model.close = { [weak self] in self?.extensionContext?.completeRequest(returningItems: nil) }
    model.open = { [weak self] url in self?.openApp(url) }
    let host = UIHostingController(rootView: ShareSheet(model: model))
    host.view.backgroundColor = .clear
    addChild(host)
    host.view.frame = view.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(host.view)
    host.didMove(toParent: self)
    model.load(extensionContext?.inputItems as? [NSExtensionItem] ?? [])
  }

  /// Extensions can't call `UIApplication.open`; the app object is reachable through the
  /// responder chain, and asked by selector.
  private func openApp(_ url: URL) {
    var responder: UIResponder? = self
    let selector = sel_registerName("openURL:options:completionHandler:")
    while let current = responder {
      if let app = current as? UIApplication, app.responds(to: selector) {
        typealias Open = @convention(c) (NSObject, Selector, URL, NSDictionary, Any?) -> Void
        let open = unsafeBitCast(app.method(for: selector), to: Open.self)
        open(app, selector, url, NSDictionary(), nil)
        return
      }
      responder = current.next
    }
  }
}

/// One thing shared, kept in the App Group once copied.
struct SharedFile {
  let path: String
  let mime: String
  let bytes: Int
  let kind: Kind

  enum Kind { case photo, video, file }
}

/// What the sheet shows and sends.
final class ShareModel: ObservableObject {
  @Published var files: [SharedFile] = []
  @Published var url: String?
  @Published var text = ""
  @Published var thumbnail: UIImage?
  @Published var loading = true
  @Published var tooMany = false
  @Published var chosen: Set<String> = []
  @Published var words = ""

  let data = SurfaceData.read()
  lazy var copy = SurfaceCopy(lang: data?.lang)
  var close: () -> Void = {}
  var open: (URL) -> Void = { _ in }

  /// Farms and visits, the most recently active first.
  var farms: [SurfaceFarm] { (data?.farms ?? []).sorted { $0.updatedAt > $1.updatedAt } }

  /// The first file's name, shared by every draft of this share.
  private let batch = ShareModel.opId()

  var canSend: Bool { !loading && !chosen.isEmpty && hasSomething }

  var hasSomething: Bool {
    !files.isEmpty || url != nil || !(text + words).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
  }

  /// "2 photos", "A link", and so on.
  var title: String {
    let photos = files.filter { $0.kind == .photo }.count
    let videos = files.filter { $0.kind == .video }.count
    let others = files.count - photos - videos
    if files.isEmpty { return copy.text(url != nil ? "share.link" : "share.words") }
    if photos == files.count { return copy.text("share.photos", count: photos) }
    if videos == files.count { return copy.text("share.videos", count: videos) }
    if others == files.count { return copy.text("share.files", count: others) }
    return copy.text("share.things", count: files.count)
  }

  func toggle(_ farm: String) {
    if chosen.contains(farm) { chosen.remove(farm) } else { chosen.insert(farm) }
  }

  func load(_ items: [NSExtensionItem]) {
    let providers = items.flatMap { $0.attachments ?? [] }
    let group = DispatchGroup()
    var loaded: [(Int, SharedFile)] = []
    var count = 0
    let lock = NSLock()
    for (index, provider) in providers.enumerated() {
      if let type = Self.fileType(of: provider) {
        count += 1
        guard count <= 10 else {
          tooMany = true
          continue
        }
        group.enter()
        provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { [weak self] url, _ in
          defer { group.leave() }
          guard let self, let url, let file = self.keep(url, type: type, index: index) else { return }
          lock.lock()
          loaded.append((index, file))
          lock.unlock()
          if file.kind == .photo, self.thumbnail == nil, let image = UIImage(contentsOfFile: url.path) {
            let small = image.preparingThumbnail(of: CGSize(width: 156, height: 156))
            DispatchQueue.main.async { self.thumbnail = self.thumbnail ?? small }
          }
        }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.url.identifier) { [weak self] item, _ in
          defer { group.leave() }
          if let link = item as? URL, ["http", "https"].contains(link.scheme ?? "") {
            DispatchQueue.main.async { self?.url = link.absoluteString }
          }
        }
      } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
        group.enter()
        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) { [weak self] item, _ in
          defer { group.leave() }
          if let words = item as? String {
            DispatchQueue.main.async { self?.text = String(words.prefix(4000)) }
          }
        }
      }
    }
    group.notify(queue: .main) { [weak self] in
      self?.files = loaded.sorted { $0.0 < $1.0 }.map(\.1)
      self?.loading = false
    }
  }

  private static func fileType(of provider: NSItemProvider) -> UTType? {
    for type in [UTType.image, UTType.movie, UTType.pdf, UTType.data]
    where provider.hasItemConformingToTypeIdentifier(type.identifier) {
      // A web link or a bit of text also conforms to `data`; those aren't files.
      if type == .data,
        provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)
          || provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier)
      {
        return nil
      }
      return provider.registeredContentTypes.first { $0.conforms(to: type) } ?? type
    }
    return nil
  }

  /// Copies a shared file into the outbox folder, under this share's id.
  private func keep(_ source: URL, type: UTType, index: Int) -> SharedFile? {
    guard let folder = GroupFiles.url(GroupFiles.shareOutbox) else { return nil }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let ext = source.pathExtension.isEmpty ? (type.preferredFilenameExtension ?? "bin") : source.pathExtension
    let name = "\(batch)-\(index).\(ext.lowercased().filter { $0.isLetter || $0.isNumber })"
    let target = folder.appendingPathComponent(name)
    try? FileManager.default.removeItem(at: target)
    guard (try? FileManager.default.copyItem(at: source, to: target)) != nil,
      let size = (try? FileManager.default.attributesOfItem(atPath: target.path)[.size]) as? Int,
      size > 0, size <= 100 * 1024 * 1024
    else { return nil }
    let resolved = UTType(filenameExtension: ext) ?? type
    let mime = resolved.preferredMIMEType ?? "application/octet-stream"
    let kind: SharedFile.Kind =
      resolved.conforms(to: .image) ? .photo : resolved.conforms(to: .movie) ? .video : .file
    return SharedFile(path: GroupFiles.shareOutbox + name, mime: mime, bytes: size, kind: kind)
  }

  /// One draft per farm chosen, then the app takes over.
  func send() {
    guard canSend, let folder = GroupFiles.url(GroupFiles.shareOutbox) else { return }
    let words = [text, self.words].map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }.joined(separator: "\n")
    for farm in chosen {
      let opId = Self.opId()
      var draft: [String: Any] = [
        "opId": opId,
        "farm": farm,
        "at": Int(Date().timeIntervalSince1970 * 1000),
        "files": files.map { ["path": $0.path, "mime": $0.mime, "bytes": $0.bytes] },
      ]
      if !words.isEmpty { draft["text"] = String(words.prefix(4000)) }
      if let url { draft["url"] = url }
      if let json = try? JSONSerialization.data(withJSONObject: draft) {
        try? json.write(to: folder.appendingPathComponent("\(opId).json"), options: .atomic)
      }
    }
    let scheme = GroupFiles.appBundleId.hasSuffix(".dev") ? "kithfield-dev" : "kithfield"
    if let link = URL(string: "\(scheme)://surfaces/open?to=share") { open(link) }
    close()
  }

  /// Leaves nothing behind when the person cancels.
  func cancel() {
    for file in files {
      if let url = GroupFiles.url(file.path) { try? FileManager.default.removeItem(at: url) }
    }
    close()
  }

  /// A lowercase UUIDv7 (`OpId`): 48 bits of milliseconds, the version, then random bits.
  static func opId() -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, 16, &bytes)
    let ms = UInt64(Date().timeIntervalSince1970 * 1000)
    for i in 0..<6 { bytes[i] = UInt8((ms >> (8 * (5 - UInt64(i)))) & 0xFF) }
    bytes[6] = (bytes[6] & 0x0F) | 0x70
    bytes[8] = (bytes[8] & 0x3F) | 0x80
    let hex = bytes.map { String(format: "%02x", $0) }.joined()
    let parts = [0..<8, 8..<12, 12..<16, 16..<20, 20..<32].map { range -> String in
      let start = hex.index(hex.startIndex, offsetBy: range.lowerBound)
      let end = hex.index(hex.startIndex, offsetBy: range.upperBound)
      return String(hex[start..<end])
    }
    return parts.joined(separator: "-")
  }
}
