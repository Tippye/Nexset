import AppIntents
import Foundation

private enum NexsetIntentBridge {
  static let appGroup = "group.com.anonymous.nexset"

  static func store(_ action: String) {
    UserDefaults(suiteName: appGroup)?.set(action, forKey: "NexsetPendingIntent")
  }
}

@available(iOS 16.0, watchOS 9.0, *)
struct StartNexsetWorkoutIntent: AppIntent {
  static let title: LocalizedStringResource = "开始 Nexset 训练"
  static let description = IntentDescription("打开 Nexset 并开始今天的力量训练。")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    NexsetIntentBridge.store("startWorkout")
    return .result()
  }
}

@available(iOS 16.0, watchOS 9.0, *)
struct LogNexsetSetIntent: AppIntent {
  static let title: LocalizedStringResource = "记录当前组"
  static let description = IntentDescription("使用最近的重量和次数记录当前训练组。")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    NexsetIntentBridge.store("logSet")
    return .result()
  }
}

@available(iOS 16.0, watchOS 9.0, *)
struct SyncNexsetHealthIntent: AppIntent {
  static let title: LocalizedStringResource = "同步健康数据"
  static let description = IntentDescription("将 Apple 健康中的近期训练和身体数据同步到 Nexset。")
  static let openAppWhenRun = true

  func perform() async throws -> some IntentResult {
    NexsetIntentBridge.store("syncHealth")
    return .result()
  }
}

@available(iOS 16.0, watchOS 9.0, *)
struct NexsetAppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: StartNexsetWorkoutIntent(),
      phrases: ["用 \(.applicationName) 开始训练", "在 \(.applicationName) 开始力量训练"],
      shortTitle: "开始训练",
      systemImageName: "figure.strengthtraining.traditional"
    )
    AppShortcut(
      intent: LogNexsetSetIntent(),
      phrases: ["用 \(.applicationName) 记录当前组"],
      shortTitle: "记录当前组",
      systemImageName: "checkmark.circle"
    )
    AppShortcut(
      intent: SyncNexsetHealthIntent(),
      phrases: ["用 \(.applicationName) 同步健康数据"],
      shortTitle: "同步健康",
      systemImageName: "heart.text.square"
    )
  }
}
