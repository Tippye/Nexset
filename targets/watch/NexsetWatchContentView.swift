import SwiftUI
import WatchKit

struct NexsetWatchContentView: View {
  @StateObject private var connectivity = NexsetWatchConnectivity.shared
  @StateObject private var workout = NexsetWatchWorkoutSession.shared
  @StateObject private var counter = NexsetAutoRepCounter()
  @State private var weightKg = 20.0
  @State private var manualReps = 10
  @State private var automatic = false

  private let appGroup = "group.com.anonymous.nexset"

  var body: some View {
    ScrollView {
      VStack(spacing: 10) {
        connectionHeader
        if connectivity.context.active {
          activeWorkout
        } else {
          startWorkout
        }
      }
      .padding(.horizontal, 4)
    }
    .onAppear(perform: consumePendingIntent)
  }

  private var connectionHeader: some View {
    HStack(spacing: 5) {
      Circle()
        .fill(connectivity.isReachable ? Color.green : Color.orange)
        .frame(width: 7, height: 7)
      Text(connectivity.isReachable ? "iPhone 已连接" : "离线记录")
        .font(.caption2)
        .foregroundStyle(.secondary)
      Spacer()
      if let heartRate = workout.heartRate {
        Text("♥︎ \(Int(heartRate))")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.red)
      }
    }
  }

  private var startWorkout: some View {
    VStack(spacing: 12) {
      Image(systemName: "figure.strengthtraining.traditional")
        .font(.system(size: 31))
        .foregroundStyle(nexsetAccent)
      Text("准备开始训练")
        .font(.headline)
      Text("训练计划和动作会由 iPhone 同步到手表。")
        .font(.caption2)
        .foregroundStyle(.secondary)
        .multilineTextAlignment(.center)
      Button("开始训练") {
        startFromWatch()
      }
      .buttonStyle(.borderedProminent)
      .tint(nexsetAccent)
      .foregroundStyle(.black)
    }
  }

  private var activeWorkout: some View {
    VStack(spacing: 10) {
      VStack(spacing: 3) {
        Text(connectivity.context.label)
          .font(.caption2)
          .foregroundStyle(.secondary)
        Text(connectivity.context.exerciseName)
          .font(.headline)
          .multilineTextAlignment(.center)
        Text("第 \(connectivity.context.currentSet)/\(connectivity.context.targetSets) 组 · 总进度 \(connectivity.context.completedSets)/\(connectivity.context.totalSets)")
          .font(.caption2.monospacedDigit())
          .foregroundStyle(.secondary)
      }

      if let restEnd = connectivity.context.restEndsAt, restEnd > Date() {
        TimelineView(.periodic(from: .now, by: 1)) { _ in
          Text(timerText(until: restEnd))
            .font(.title2.bold().monospacedDigit())
            .foregroundStyle(.cyan)
        }
      }

      Toggle("自动计数 Beta", isOn: $automatic)
        .font(.caption)
        .onChange(of: automatic) { _, enabled in
          if enabled { counter.start() } else { counter.stop() }
        }

      if automatic {
        Text("\(counter.count)")
          .font(.system(size: 38, weight: .bold, design: .rounded))
          .contentTransition(.numericText())
        Button("记录自动组") {
          counter.stop()
          connectivity.sendSet(
            weightKg: weightKg,
            reps: counter.count,
            automatic: true,
            confidence: counter.confidence
          )
          automatic = false
        }
        .disabled(counter.count == 0)
      } else {
        Stepper(value: $weightKg, in: 0...400, step: 2.5) {
          HStack {
            Text("重量")
            Spacer()
            Text("\(weightKg, specifier: "%.1f") kg").monospacedDigit()
          }
          .font(.caption)
        }
        Stepper(value: $manualReps, in: 1...100) {
          HStack {
            Text("次数")
            Spacer()
            Text("\(manualReps)").monospacedDigit()
          }
          .font(.caption)
        }
        Button("记录这组") {
          connectivity.sendSet(
            weightKg: weightKg,
            reps: manualReps,
            automatic: false,
            confidence: nil
          )
        }
        .buttonStyle(.borderedProminent)
        .tint(nexsetAccent)
        .foregroundStyle(.black)
      }

      Button("结束 Watch 训练", role: .destructive) {
        counter.stop()
        Task { await workout.finish() }
      }
      .font(.caption)
    }
  }

  private func startFromWatch() {
    connectivity.sendStartWorkout()
    WKInterfaceDevice.current().play(.start)
    Task { await workout.start() }
  }

  private func consumePendingIntent() {
    guard let defaults = UserDefaults(suiteName: appGroup),
          let action = defaults.string(forKey: "NexsetPendingIntent")
    else { return }
    defaults.removeObject(forKey: "NexsetPendingIntent")
    if action == "startWorkout" {
      startFromWatch()
    } else if action == "logSet" {
      connectivity.sendSet(
        weightKg: weightKg,
        reps: manualReps,
        automatic: false,
        confidence: nil
      )
    }
  }

  private func timerText(until date: Date) -> String {
    let seconds = max(0, Int(date.timeIntervalSinceNow.rounded(.up)))
    return String(format: "%02d:%02d", seconds / 60, seconds % 60)
  }

  private var nexsetAccent: Color {
    Color(red: 0.83, green: 1.0, blue: 0.20)
  }
}
