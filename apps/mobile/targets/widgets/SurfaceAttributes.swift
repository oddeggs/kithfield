import ActivityKit
import Foundation

/// The Live Activity's type, the same in the app and the widget extension: keep
/// `targets/widgets/SurfaceAttributes.swift` identical to `modules/surfaces/ios/SurfaceAttributes.swift`.
/// What it shows arrives as JSON the app wrote (`PlanDayActivity` and `FireActivity` in
/// `packages/contracts/src/surfaces.ts`), already in the person's language: Swift only lays it out.
public struct SurfaceAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// The activity's `state`, as JSON.
    public var json: String

    public init(json: String) {
      self.json = json
    }
  }

  /// `plan_day` or `fire`.
  public var kind: String
  /// What the activity follows: the farm for the fire, the farm and seed for a plan's day.
  public var key: String
  /// The activity's `attributes`, as JSON.
  public var json: String

  public init(kind: String, key: String, json: String) {
    self.kind = kind
    self.key = key
    self.json = json
  }
}
