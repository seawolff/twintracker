import ActivityKit
import SwiftUI
import WidgetKit

private let twinTrackerHomeURL = URL(string: "twintracker://home")

@available(iOSApplicationExtension 16.1, *)
private enum TwinTrackerDateParser {
  static let formatterWithFractionalSeconds: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  static func parse(_ iso: String?) -> Date? {
    guard let iso else {
      return nil
    }
    return formatterWithFractionalSeconds.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
  }
}

@available(iOSApplicationExtension 16.1, *)
private enum TwinTrackerLiveActivityUrgency: String {
  case ok
  case soon
  case overdue
}

@available(iOSApplicationExtension 16.1, *)
private func urgencyColor(_ raw: String) -> Color {
  switch TwinTrackerLiveActivityUrgency(rawValue: raw) ?? .ok {
  case .overdue:
    return .red
  case .soon:
    return .orange
  case .ok:
    return Color.white.opacity(0.68)
  }
}

@available(iOSApplicationExtension 16.1, *)
private func babyAccentColor(_ raw: String) -> Color {
  switch raw {
  case "amber":
    return Color(red: 0.96, green: 0.76, blue: 0.33)
  case "emerald":
    return Color(red: 0.31, green: 0.82, blue: 0.61)
  case "slate":
    return Color(red: 0.62, green: 0.69, blue: 0.79)
  case "rose":
    return Color(red: 0.94, green: 0.52, blue: 0.58)
  case "sky":
    return Color(red: 0.42, green: 0.72, blue: 0.95)
  case "violet":
    return Color(red: 0.69, green: 0.56, blue: 0.96)
  default:
    return Color.white.opacity(0.75)
  }
}

@available(iOSApplicationExtension 16.1, *)
private func actionSymbol(for raw: String?, feedMode: String) -> String {
  switch raw {
  case "bottle":
    return feedMode == "nursing" ? "figure.seated.side.air.upper" : "drop.fill"
  case "diaper":
    return "checklist"
  case "nap":
    return "moon.fill"
  default:
    return "moon.stars.fill"
  }
}

@available(iOSApplicationExtension 16.1, *)
@ViewBuilder
private func actionCue(for raw: String?, feedMode: String, urgency: String) -> some View {
  if raw == "diaper" {
    Text("Diaper")
      .font(.system(size: 11.5, weight: .bold, design: .rounded))
      .foregroundStyle(urgencyColor(urgency))
  } else {
    Image(systemName: actionSymbol(for: raw, feedMode: feedMode))
      .font(.system(size: 12, weight: .bold))
      .foregroundStyle(urgencyColor(urgency))
  }
}

@available(iOSApplicationExtension 16.1, *)
func triageLabel(feedMode: String? = nil, kind: String) -> String {
  switch kind {
  case "feed":
    return feedMode == "nursing" ? "Nurse" : "Feed"
  case "sleep":
    return "Sleep"
  case "diaper":
    return "Diaper"
  default:
    return "Info"
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerTriageCellView: View {
  let label: String
  let value: String

  var body: some View {
    HStack(spacing: 5) {
      Text(label.uppercased())
        .font(.system(size: 8.5, weight: .bold, design: .rounded))
        .foregroundStyle(.white.opacity(0.68))
        .lineLimit(1)
      Text(value)
        .font(.system(size: 10.5, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.95))
        .lineLimit(1)
        .minimumScaleFactor(0.65)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(.horizontal, 9)
    .padding(.vertical, 8)
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerTriageStripView: View {
  let state: TwinTrackerLiveActivityAttributes.BabyContentState

  var body: some View {
    HStack(spacing: 0) {
      TwinTrackerTriageCellView(
        label: triageLabel(feedMode: state.feedMode, kind: "feed"),
        value: state.feedSummary
      )
      Divider().overlay(Color.white.opacity(0.08))
      TwinTrackerTriageCellView(
        label: triageLabel(kind: "sleep"),
        value: state.sleepSummary
      )
      Divider().overlay(Color.white.opacity(0.08))
      TwinTrackerTriageCellView(
        label: triageLabel(kind: "diaper"),
        value: state.diaperSummary
      )
    }
    .background(Color.white.opacity(0.06))
    .overlay(
      RoundedRectangle(cornerRadius: 14, style: .continuous)
        .stroke(Color.white.opacity(0.08), lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerBabyPaneView: View {
  let state: TwinTrackerLiveActivityAttributes.BabyContentState

  private var targetDate: Date? {
    TwinTrackerDateParser.parse(state.nextTargetAt)
  }

  private var lastEventDate: Date? {
    TwinTrackerDateParser.parse(state.lastEventAt)
  }

  private func relativeString(for date: Date) -> String {
    let formatter = RelativeDateTimeFormatter()
    formatter.unitsStyle = .abbreviated
    return formatter.localizedString(for: date, relativeTo: Date())
  }

  private var statusLine: String {
    if let lastEventDate {
      return "\(state.headline.uppercased()) • \(relativeString(for: lastEventDate).uppercased())"
    }
    return state.headline.uppercased()
  }

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      HStack(alignment: .firstTextBaseline, spacing: 8) {
        Circle()
          .fill(babyAccentColor(state.babyColor))
          .frame(width: 9, height: 9)

        Text(state.babyName)
          .font(.system(size: 22, weight: .bold, design: .rounded))
          .foregroundStyle(.white)
          .lineLimit(1)
          .minimumScaleFactor(0.8)

        Text(statusLine)
          .font(.system(size: 10.5, weight: .bold, design: .monospaced))
          .foregroundStyle(.white.opacity(0.72))
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }

      Text(state.narrative)
        .font(.system(size: 13.5, weight: .semibold, design: .rounded))
        .foregroundStyle(.white.opacity(0.92))
        .lineLimit(2)
        .fixedSize(horizontal: false, vertical: true)

      TwinTrackerTriageStripView(state: state)

      if let nextActionLabel = state.nextActionLabel {
        HStack(alignment: .firstTextBaseline, spacing: 7) {
          actionCue(for: state.nextActionType, feedMode: state.feedMode, urgency: state.urgency)

          Text(nextActionLabel)
            .font(.system(size: 12.5, weight: .bold, design: .rounded))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(0.8)

          if let targetDate, targetDate > Date() {
            Text(targetDate, style: .timer)
              .font(.system(size: 12.5, weight: .bold, design: .monospaced))
              .foregroundStyle(.white.opacity(0.9))
              .monospacedDigit()
          } else if let summary = state.nextSummary {
            Text(summary)
              .font(.system(size: 12.5, weight: .medium, design: .rounded))
              .foregroundStyle(.white.opacity(0.82))
              .lineLimit(1)
              .minimumScaleFactor(0.8)
          }
        }
      } else if let summary = state.nextSummary {
        Text(summary)
          .font(.system(size: 12.5, weight: .medium, design: .rounded))
          .foregroundStyle(.white.opacity(0.82))
          .lineLimit(1)
          .minimumScaleFactor(0.8)
      }
    }
    .padding(.horizontal, 16)
    .padding(.vertical, 15)
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(
      RoundedRectangle(cornerRadius: 20, style: .continuous)
        .fill(Color.white.opacity(0.035))
        .overlay(
          RoundedRectangle(cornerRadius: 20, style: .continuous)
            .stroke(babyAccentColor(state.babyColor).opacity(0.42), lineWidth: 1)
        )
    )
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerLiveActivityCardView: View {
  let context: ActivityViewContext<TwinTrackerLiveActivityAttributes>

  private var primaryBaby: TwinTrackerLiveActivityAttributes.BabyContentState? {
    context.state.babies.first
  }

  var body: some View {
    Group {
      if let baby = primaryBaby {
        TwinTrackerBabyPaneView(state: baby)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .padding(.horizontal, 8)
    .padding(.vertical, 8)
    .background(
      RoundedRectangle(cornerRadius: 28, style: .continuous)
        .fill(
          LinearGradient(
            colors: [
              Color.black.opacity(0.97),
              Color.black.opacity(0.90)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
        )
        .overlay(
          LinearGradient(
            colors: [
              Color.white.opacity(0.10),
              Color.clear,
              Color.white.opacity(0.03)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
          )
          .clipShape(RoundedRectangle(cornerRadius: 28, style: .continuous))
        )
        .overlay(
          RoundedRectangle(cornerRadius: 28, style: .continuous)
            .stroke(Color.white.opacity(0.10), lineWidth: 1)
        )
    )
    .widgetURL(twinTrackerHomeURL)
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerCompactLeadingView: View {
  let context: ActivityViewContext<TwinTrackerLiveActivityAttributes>

  var body: some View {
    if let baby = context.state.babies.first {
      Text(String(baby.babyName.prefix(1)).uppercased())
        .font(.system(size: 14, weight: .bold, design: .rounded))
        .foregroundStyle(babyAccentColor(baby.babyColor))
    }
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerCompactTrailingView: View {
  let context: ActivityViewContext<TwinTrackerLiveActivityAttributes>

  var body: some View {
    if let baby = context.state.babies.first,
       let targetDate = TwinTrackerDateParser.parse(baby.nextTargetAt),
       targetDate > Date() {
      Text(targetDate, style: .timer)
        .font(.system(size: 12, weight: .bold, design: .monospaced))
        .foregroundStyle(.white)
        .monospacedDigit()
    } else if let baby = context.state.babies.first {
      actionCue(for: baby.nextActionType, feedMode: baby.feedMode, urgency: baby.urgency)
    }
  }
}

@available(iOSApplicationExtension 16.1, *)
private struct TwinTrackerMinimalView: View {
  let context: ActivityViewContext<TwinTrackerLiveActivityAttributes>

  var body: some View {
    if let baby = context.state.babies.first {
      actionCue(for: baby.nextActionType, feedMode: baby.feedMode, urgency: baby.urgency)
    }
  }
}

@available(iOSApplicationExtension 16.1, *)
@main
struct TwinTrackerWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: TwinTrackerLiveActivityAttributes.self) { context in
      TwinTrackerLiveActivityCardView(context: context)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        .activityBackgroundTint(.clear)
        .activitySystemActionForegroundColor(.white)
        .widgetURL(twinTrackerHomeURL)
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          VStack(alignment: .leading, spacing: 8) {
            Text(context.state.babies.first?.babyName ?? "TwinTracker")
              .font(.system(size: 17, weight: .bold, design: .rounded))
              .foregroundStyle(.white)
              .lineLimit(1)
            Text("Live baby card")
              .font(.system(size: 12, weight: .bold, design: .monospaced))
              .foregroundStyle(.white.opacity(0.72))
            if let baby = context.state.babies.first {
              Text(baby.narrative)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.white.opacity(0.88))
                .lineLimit(2)
            }
          }
          .frame(maxWidth: .infinity, alignment: .leading)
          .padding(.vertical, 6)
        }
      } compactLeading: {
        TwinTrackerCompactLeadingView(context: context)
      } compactTrailing: {
        TwinTrackerCompactTrailingView(context: context)
      } minimal: {
        TwinTrackerMinimalView(context: context)
      }
      .keylineTint(.white)
      .widgetURL(twinTrackerHomeURL)
    }
  }
}
