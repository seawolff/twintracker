import ActivityKit
import Foundation
import React

@available(iOS 16.1, *)
private enum TwinTrackerLiveActivityController {
  private static func rankingDate(for snapshot: TwinTrackerLiveActivitySnapshot) -> Date {
    guard let baby = snapshot.babies.first else {
      return .distantPast
    }

    let parser = ISO8601DateFormatter()
    parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let fallbackParser = ISO8601DateFormatter()

    return parser.date(from: baby.lastEventAt ?? "")
      ?? fallbackParser.date(from: baby.lastEventAt ?? "")
      ?? parser.date(from: baby.startedAt)
      ?? fallbackParser.date(from: baby.startedAt)
      ?? .distantPast
  }

  @available(iOS 16.2, *)
  private static func content(
    for snapshot: TwinTrackerLiveActivitySnapshot,
    scores: [String: Double]
  ) -> ActivityContent<TwinTrackerLiveActivityAttributes.ContentState> {
    ActivityContent(
      state: TwinTrackerLiveActivityAttributes.ContentState(snapshot: snapshot),
      staleDate: nil,
      relevanceScore: scores[snapshot.activityId] ?? 0
    )
  }

  static func sync(_ snapshots: [TwinTrackerLiveActivitySnapshot]) async throws {
    let rankedIds = snapshots
      .sorted { rankingDate(for: $0) > rankingDate(for: $1) }
      .map(\.activityId)
    let relevanceScores = Dictionary(
      uniqueKeysWithValues: rankedIds.enumerated().map { index, activityId in
        (activityId, Double(max(rankedIds.count - index, 1)) * 100)
      }
    )
    var desired = Dictionary(uniqueKeysWithValues: snapshots.map { ($0.activityId, $0) })

    for activity in Activity<TwinTrackerLiveActivityAttributes>.activities {
      let activityId = activity.attributes.activityId
      guard let snapshot = desired.removeValue(forKey: activityId) else {
        await activity.end(dismissalPolicy: .immediate)
        continue
      }

      if #available(iOS 16.2, *) {
        await activity.update(content(for: snapshot, scores: relevanceScores))
      } else {
        await activity.update(using: TwinTrackerLiveActivityAttributes.ContentState(snapshot: snapshot))
      }
    }

    for snapshot in desired.values {
      if #available(iOS 16.2, *) {
        _ = try Activity<TwinTrackerLiveActivityAttributes>.request(
          attributes: TwinTrackerLiveActivityAttributes(snapshot: snapshot),
          content: content(for: snapshot, scores: relevanceScores),
          pushType: nil
        )
      } else {
        _ = try Activity<TwinTrackerLiveActivityAttributes>.request(
          attributes: TwinTrackerLiveActivityAttributes(snapshot: snapshot),
          contentState: TwinTrackerLiveActivityAttributes.ContentState(snapshot: snapshot),
          pushType: nil
        )
      }
    }
  }

  static func clear() async {
    for activity in Activity<TwinTrackerLiveActivityAttributes>.activities {
      await activity.end(dismissalPolicy: .immediate)
    }
  }
}

@objc(LiveActivityModule)
class LiveActivityModule: NSObject {
  @objc
  static func requiresMainQueueSetup() -> Bool {
    false
  }

  @objc
  func syncActivities(
    _ json: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    Task {
      do {
        let data = Data(json.utf8)
        let snapshots = try JSONDecoder().decode([TwinTrackerLiveActivitySnapshot].self, from: data)
        try await TwinTrackerLiveActivityController.sync(snapshots)
        resolve(nil)
      } catch {
        reject("live_activity_sync_failed", "Failed to sync Live Activities.", error)
      }
    }
  }

  @objc
  func clearActivities(
    _ resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard #available(iOS 16.1, *) else {
      resolve(nil)
      return
    }

    Task {
      await TwinTrackerLiveActivityController.clear()
      resolve(nil)
    }
  }
}
