import UIKit

/// The share sheet's Kithfield entry. It accepts up to `LIMITS.mediaItems` (10) photos, videos or
/// files, a web link, or text, as a `ShareDraft` can carry; choosing the farm and sending is
/// still to be built, so for now it closes without sending anything.
final class ShareViewController: UIViewController {
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    extensionContext?.completeRequest(returningItems: nil)
  }
}
