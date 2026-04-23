import ActivityKit
import Foundation

struct TwinTrackerLiveActivityBabySnapshot: Codable, Hashable {
  let babyId: String
  let babyName: String
  let babyColor: String
  let eventId: String
  let eventType: String
  let startedAt: String
  let headline: String
  let narrative: String
  let urgency: String
  let lastEventLabel: String?
  let lastEventAt: String?
  let nextActionType: String?
  let nextActionLabel: String?
  let nextTargetAt: String?
  let nextSummary: String?
  let feedSummary: String
  let feedUrgency: String
  let feedMode: String
  let sleepSummary: String
  let sleepUrgency: String
  let diaperSummary: String
  let diaperUrgency: String
}

struct TwinTrackerLiveActivitySnapshot: Codable, Hashable {
  let activityId: String
  let babies: [TwinTrackerLiveActivityBabySnapshot]
}

@available(iOS 16.1, *)
struct TwinTrackerLiveActivityAttributes: ActivityAttributes {
  public struct BabyContentState: Codable, Hashable {
    let babyId: String
    let babyName: String
    let babyColor: String
    let eventId: String
    let eventType: String
    let startedAt: String
    let headline: String
    let narrative: String
    let urgency: String
    let lastEventLabel: String?
    let lastEventAt: String?
    let nextActionType: String?
    let nextActionLabel: String?
    let nextTargetAt: String?
    let nextSummary: String?
    let feedSummary: String
    let feedUrgency: String
    let feedMode: String
    let sleepSummary: String
    let sleepUrgency: String
    let diaperSummary: String
    let diaperUrgency: String
  }

  public struct ContentState: Codable, Hashable {
    let babies: [BabyContentState]
  }

  let activityId: String
}

@available(iOS 16.1, *)
extension TwinTrackerLiveActivityAttributes {
  init(snapshot: TwinTrackerLiveActivitySnapshot) {
    self.init(activityId: snapshot.activityId)
  }
}

@available(iOS 16.1, *)
extension TwinTrackerLiveActivityAttributes.BabyContentState {
  init(snapshot: TwinTrackerLiveActivityBabySnapshot) {
    self.init(
      babyId: snapshot.babyId,
      babyName: snapshot.babyName,
      babyColor: snapshot.babyColor,
      eventId: snapshot.eventId,
      eventType: snapshot.eventType,
      startedAt: snapshot.startedAt,
      headline: snapshot.headline,
      narrative: snapshot.narrative,
      urgency: snapshot.urgency,
      lastEventLabel: snapshot.lastEventLabel,
      lastEventAt: snapshot.lastEventAt,
      nextActionType: snapshot.nextActionType,
      nextActionLabel: snapshot.nextActionLabel,
      nextTargetAt: snapshot.nextTargetAt,
      nextSummary: snapshot.nextSummary,
      feedSummary: snapshot.feedSummary,
      feedUrgency: snapshot.feedUrgency,
      feedMode: snapshot.feedMode,
      sleepSummary: snapshot.sleepSummary,
      sleepUrgency: snapshot.sleepUrgency,
      diaperSummary: snapshot.diaperSummary,
      diaperUrgency: snapshot.diaperUrgency
    )
  }
}

@available(iOS 16.1, *)
extension TwinTrackerLiveActivityAttributes.ContentState {
  init(snapshot: TwinTrackerLiveActivitySnapshot) {
    self.init(babies: snapshot.babies.map(TwinTrackerLiveActivityAttributes.BabyContentState.init))
  }
}
