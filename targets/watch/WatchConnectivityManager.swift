import Foundation
import WatchConnectivity
import WatchKit

struct NexsetWatchWorkoutContext: Equatable {
  var active = false
  var sessionId = ""
  var label = "Nexset"
  var exerciseName = "准备训练"
  var completedSets = 0
  var totalSets = 0
  var currentSet = 1
  var targetSets = 1
  var restEndsAt: Date?

  init(dictionary: [String: Any] = [:]) {
    active = dictionary["active"] as? Bool ?? false
    sessionId = dictionary["sessionId"] as? String ?? ""
    label = dictionary["label"] as? String ?? "Nexset"
    exerciseName = dictionary["exerciseName"] as? String ?? "准备训练"
    completedSets = dictionary["completedSets"] as? Int ?? 0
    totalSets = dictionary["totalSets"] as? Int ?? 0
    currentSet = dictionary["currentSet"] as? Int ?? 1
    targetSets = dictionary["targetSets"] as? Int ?? 1
    if let milliseconds = dictionary["restEndsAt"] as? Double, milliseconds > 0 {
      restEndsAt = Date(timeIntervalSince1970: milliseconds / 1000)
    }
  }
}

@MainActor
final class NexsetWatchConnectivity: NSObject, ObservableObject {
  static let shared = NexsetWatchConnectivity()

  @Published private(set) var isReachable = false
  @Published private(set) var context = NexsetWatchWorkoutContext()

  private var session: WCSession?
  private var restHapticTask: Task<Void, Never>?

  override private init() {
    super.init()
    guard WCSession.isSupported() else { return }
    session = .default
    session?.delegate = self
    session?.activate()
    if let received = session?.receivedApplicationContext, !received.isEmpty {
      apply(received)
    }
  }

  func sendStartWorkout() {
    context.active = true
    context.label = "Watch 训练"
    sendEvent([
      "eventId": UUID().uuidString,
      "type": "startWorkout",
    ])
  }

  func sendSet(weightKg: Double?, reps: Int, automatic: Bool, confidence: Double?) {
    var event: [String: Any] = [
      "eventId": UUID().uuidString,
      "type": "logSet",
      "sessionId": context.sessionId,
      "reps": reps,
      "source": automatic ? "watch_auto" : "watch_manual",
    ]
    if let weightKg { event["weightKg"] = weightKg }
    if let confidence { event["confidence"] = confidence }
    sendEvent(event)
    context.completedSets += 1
    context.currentSet = min(context.currentSet + 1, max(context.targetSets, 1))
    WKInterfaceDevice.current().play(.success)
  }

  private func sendEvent(_ event: [String: Any]) {
    guard let session else { return }
    if session.isReachable {
      session.sendMessage(event, replyHandler: nil) { [weak session] _ in
        session?.transferUserInfo(event)
      }
    } else {
      session.transferUserInfo(event)
    }
  }

  private func apply(_ dictionary: [String: Any]) {
    context = NexsetWatchWorkoutContext(dictionary: dictionary)
    restHapticTask?.cancel()
    guard let restEndsAt = context.restEndsAt else { return }
    restHapticTask = Task {
      let delay = max(0, restEndsAt.timeIntervalSinceNow)
      try? await Task.sleep(for: .seconds(delay))
      guard !Task.isCancelled else { return }
      WKInterfaceDevice.current().play(.notification)
    }
  }
}

extension NexsetWatchConnectivity: WCSessionDelegate {
  nonisolated func session(
    _ session: WCSession,
    activationDidCompleteWith activationState: WCSessionActivationState,
    error: Error?
  ) {
    Task { @MainActor in
      self.isReachable = session.isReachable
      if !session.receivedApplicationContext.isEmpty {
        self.apply(session.receivedApplicationContext)
      }
    }
  }

  nonisolated func sessionReachabilityDidChange(_ session: WCSession) {
    Task { @MainActor in self.isReachable = session.isReachable }
  }

  nonisolated func session(
    _ session: WCSession,
    didReceiveApplicationContext applicationContext: [String: Any]
  ) {
    Task { @MainActor in self.apply(applicationContext) }
  }

  nonisolated func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
    Task { @MainActor in self.apply(message) }
  }
}
