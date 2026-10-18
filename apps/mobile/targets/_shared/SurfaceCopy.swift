import Foundation

/// The surfaces' copy in the language the app last wrote (`SurfaceData.lang`), from the table
/// compiled out of the i18n catalogue. Plurals pick `one` for a count of one in English, as the
/// app's own lookup does; Vietnamese has only `other`.
struct SurfaceCopy {
  let lang: String

  init(lang: String?) {
    let wanted = lang ?? Locale.preferredLanguages.first.map { String($0.prefix(2)) } ?? "en"
    self.lang = SurfaceCopyTable.entries[wanted] == nil ? "en" : wanted
  }

  /// The locale dates and times are written in.
  var locale: Locale { Locale(identifier: lang == "vi" ? "vi_VN" : "en_GB") }

  /// `key` with `{name}` placeholders filled; `count` picks the plural form.
  func text(_ key: String, count: Int? = nil, _ params: [String: String] = [:]) -> String {
    let forms = SurfaceCopyTable.entries[lang]?[key] ?? SurfaceCopyTable.entries["en"]?[key] ?? [:]
    let form = (lang == "en" && count == 1) ? (forms["one"] ?? forms["other"]) : forms["other"]
    var result = form ?? key
    var values = params
    if let count { values["count"] = String(count) }
    for (name, value) in values {
      result = result.replacingOccurrences(of: "{\(name)}", with: value)
    }
    return result
  }

  /// "Pip, Fig and Bea".
  func list(_ names: [String]) -> String {
    guard let last = names.last else { return "" }
    if names.count == 1 { return last }
    return names.dropLast().joined(separator: text("list.comma")) + text("list.and") + last
  }

  /// A plural sentence about some people: `widget.up` with "Pip, Fig and Bea".
  func people(_ key: String, _ names: [String]) -> String {
    text(key, count: names.count, ["names": list(names)])
  }
}
