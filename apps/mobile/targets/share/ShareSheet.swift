import SwiftUI

/// The share sheet (`05 Gestures`, sharing into Kithfield): what's being shared and Send, the
/// farms and visits to send it to (the most recent first, several at once), a few words, and
/// what a photo does on a farm.
struct ShareSheet: View {
  @ObservedObject var model: ShareModel
  @FocusState private var typing: Bool

  private let ink = SurfacePalette.ink
  private let ink3 = SurfacePalette.ink3
  private let rule = SurfacePalette.ink.opacity(0.08)

  var body: some View {
    VStack(spacing: 0) {
      Spacer(minLength: 0).contentShape(Rectangle()).onTapGesture { model.cancel() }
      VStack(alignment: .leading, spacing: 12) {
        Capsule().fill(ink.opacity(0.18)).frame(width: 36, height: 5)
          .frame(maxWidth: .infinity)
        header
        if model.farms.isEmpty {
          Text(model.copy.text("share.noFarms"))
            .font(.system(size: 15)).foregroundStyle(ink3)
            .padding(.vertical, 24)
        } else {
          Text(model.copy.text("share.sendTo").uppercased())
            .font(.system(size: 12, weight: .bold)).tracking(12 * 0.06)
            .foregroundStyle(ink3)
            .padding(.horizontal, 4)
          ScrollView {
            VStack(spacing: 0) {
              ForEach(model.farms, id: \.farm) { farm in row(farm) }
            }
          }
          .frame(maxHeight: 360)
          .fixedSize(horizontal: false, vertical: true)
          words
        }
        Text(model.copy.text(model.tooMany ? "share.tooMany" : "share.footer"))
          .font(.system(size: 12.5)).lineSpacing(12.5 * 0.4 - 4)
          .foregroundStyle(ink3)
          .padding(.bottom, 24)
      }
      .padding(.top, 10)
      .padding(.horizontal, 20)
      .background(
        UnevenRoundedRectangle(topLeadingRadius: 30, topTrailingRadius: 30)
          .fill(SurfacePalette.sheet)
          .shadow(color: Color(hex: 0x28190A, opacity: 0.45), radius: 20, y: -10)
          .ignoresSafeArea(edges: .bottom)
      )
    }
    .environment(\.locale, model.copy.locale)
  }

  private var header: some View {
    HStack(spacing: 10) {
      Group {
        if let thumbnail = model.thumbnail {
          Image(uiImage: thumbnail).resizable().scaledToFill()
        } else {
          SurfacePalette.card
        }
      }
      .frame(width: 52, height: 52)
      .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
      VStack(alignment: .leading, spacing: 2) {
        Text(model.title).font(.system(size: 15, weight: .semibold)).foregroundStyle(ink)
        Text(model.url ?? model.copy.text("share.subtitle"))
          .font(.system(size: 13)).foregroundStyle(ink3).lineLimit(1)
      }
      Spacer(minLength: 8)
      Button(model.copy.text("share.send")) { model.send() }
        .font(.system(size: 15, weight: .semibold))
        .foregroundStyle(SurfacePalette.moss.opacity(model.canSend ? 1 : 0.4))
        .disabled(!model.canSend)
    }
  }

  private func row(_ farm: SurfaceFarm) -> some View {
    let chosen = model.chosen.contains(farm.farm)
    return Button {
      model.toggle(farm.farm)
    } label: {
      HStack(spacing: 12) {
        picture(farm)
        VStack(alignment: .leading, spacing: 2) {
          Text(farm.title).font(.system(size: 15.5, weight: .semibold)).foregroundStyle(ink)
            .lineLimit(1)
          Text(
            farm.kind == "visit"
              ? model.copy.text("share.visit")
              : model.copy.text("share.critters", count: farm.critters.count)
          )
          .font(.system(size: 13)).foregroundStyle(ink3).lineLimit(1)
        }
        Spacer(minLength: 8)
        ZStack {
          if chosen {
            Circle().fill(SurfacePalette.moss)
            if let check = SurfaceData.image("icon-check.png") {
              Image(uiImage: check).resizable().frame(width: 13, height: 13)
            }
          } else {
            Circle().strokeBorder(ink.opacity(0.3), lineWidth: 1.5)
          }
        }
        .frame(width: 24, height: 24)
      }
      .padding(.vertical, 9)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .overlay(alignment: .bottom) { rule.frame(height: 1) }
    .accessibilityAddTraits(chosen ? .isSelected : [])
  }

  @ViewBuilder private func picture(_ farm: SurfaceFarm) -> some View {
    if farm.kind == "visit", let friend = farm.with {
      let mine = farm.critters.first { $0.person != friend.person }
      ZStack {
        head(friend.image).offset(x: -7, y: -7)
        if let mine { head(mine.image).offset(x: 7, y: 7) }
      }
      .frame(width: 44, height: 44)
    } else {
      Group {
        if let still = SurfaceData.image(farm.images.day) {
          Image(uiImage: still).resizable().scaledToFill()
        } else {
          SurfacePalette.card
        }
      }
      .frame(width: 44, height: 44)
      .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
    }
  }

  private func head(_ name: String) -> some View {
    Group {
      if let image = SurfaceData.image(name) {
        Image(uiImage: image).resizable().scaledToFill()
      } else {
        SurfacePalette.card
      }
    }
    .frame(width: 30, height: 30)
    .clipShape(Circle())
    .overlay(Circle().stroke(SurfacePalette.sheet, lineWidth: 2))
  }

  private var words: some View {
    TextField(model.copy.text("share.placeholder"), text: $model.words, axis: .vertical)
      .font(.system(size: 15))
      .foregroundStyle(ink)
      .focused($typing)
      .lineLimit(1...4)
      .padding(.horizontal, 16)
      .padding(.vertical, 16)
      .frame(minHeight: 54)
      .background(
        RoundedRectangle(cornerRadius: 16, style: .continuous)
          .fill(SurfacePalette.card)
          .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
              .stroke(ink.opacity(0.1), lineWidth: 1))
      )
  }
}
