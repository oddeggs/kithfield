import SwiftUI
import WidgetKit

/// Everything the widget extension draws: the farm widget and the Live Activities.
@main
struct KithfieldWidgets: WidgetBundle {
  var body: some Widget {
    FarmWidget()
    SurfaceActivityWidget()
  }
}
