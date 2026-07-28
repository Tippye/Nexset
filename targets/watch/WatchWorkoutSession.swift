import CoreMotion
import Foundation
import HealthKit

@MainActor
final class NexsetWatchWorkoutSession: NSObject, ObservableObject {
  static let shared = NexsetWatchWorkoutSession()

  @Published private(set) var isRunning = false
  @Published private(set) var heartRate: Double?

  private let healthStore = HKHealthStore()
  private var session: HKWorkoutSession?
  private var builder: HKLiveWorkoutBuilder?

  func start() async {
    guard HKHealthStore.isHealthDataAvailable(), !isRunning else { return }
    do {
      let heartRateType = HKQuantityType(.heartRate)
      try await healthStore.requestAuthorization(
        toShare: [HKObjectType.workoutType()],
        read: [heartRateType, HKObjectType.workoutType()]
      )
      let configuration = HKWorkoutConfiguration()
      configuration.activityType = .traditionalStrengthTraining
      configuration.locationType = .indoor
      let session = try HKWorkoutSession(healthStore: healthStore, configuration: configuration)
      let builder = session.associatedWorkoutBuilder()
      builder.dataSource = HKLiveWorkoutDataSource(
        healthStore: healthStore,
        workoutConfiguration: configuration
      )
      session.delegate = self
      builder.delegate = self
      self.session = session
      self.builder = builder
      let start = Date()
      session.startActivity(with: start)
      try await builder.beginCollection(at: start)
      isRunning = true
    } catch {
      isRunning = false
    }
  }

  func finish() async {
    guard let session, let builder else { return }
    let end = Date()
    session.end()
    do {
      try await builder.endCollection(at: end)
      _ = try await builder.finishWorkout()
    } catch {
      // The local set records are still queued for the phone if HealthKit fails.
    }
    self.session = nil
    self.builder = nil
    isRunning = false
    heartRate = nil
  }
}

extension NexsetWatchWorkoutSession: HKWorkoutSessionDelegate {
  nonisolated func workoutSession(
    _ workoutSession: HKWorkoutSession,
    didChangeTo toState: HKWorkoutSessionState,
    from fromState: HKWorkoutSessionState,
    date: Date
  ) {}

  nonisolated func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
    Task { @MainActor in self.isRunning = false }
  }
}

extension NexsetWatchWorkoutSession: HKLiveWorkoutBuilderDelegate {
  nonisolated func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}

  nonisolated func workoutBuilder(
    _ workoutBuilder: HKLiveWorkoutBuilder,
    didCollectDataOf collectedTypes: Set<HKSampleType>
  ) {
    guard collectedTypes.contains(HKQuantityType(.heartRate)) else { return }
    let unit = HKUnit.count().unitDivided(by: .minute())
    let value = workoutBuilder.statistics(for: HKQuantityType(.heartRate))?.mostRecentQuantity()?.doubleValue(for: unit)
    Task { @MainActor in self.heartRate = value }
  }
}

@MainActor
final class NexsetAutoRepCounter: ObservableObject {
  @Published private(set) var count = 0
  @Published private(set) var isRunning = false

  private let motion = CMMotionManager()
  private let queue = OperationQueue()
  private var armed = true
  private var lastRepAt = Date.distantPast

  var confidence: Double {
    min(0.95, 0.55 + Double(count) * 0.04)
  }

  func start() {
    guard motion.isDeviceMotionAvailable else { return }
    count = 0
    armed = true
    isRunning = true
    motion.deviceMotionUpdateInterval = 1.0 / 25.0
    motion.startDeviceMotionUpdates(to: queue) { [weak self] sample, _ in
      guard let acceleration = sample?.userAcceleration else { return }
      let magnitude = sqrt(
        acceleration.x * acceleration.x
          + acceleration.y * acceleration.y
          + acceleration.z * acceleration.z
      )
      Task { @MainActor in self?.process(magnitude) }
    }
  }

  func stop() {
    motion.stopDeviceMotionUpdates()
    isRunning = false
  }

  private func process(_ magnitude: Double) {
    if !armed, magnitude < 0.22 {
      armed = true
      return
    }
    guard armed, magnitude > 0.62, Date().timeIntervalSince(lastRepAt) > 0.5 else { return }
    count += 1
    lastRepAt = Date()
    armed = false
  }
}
