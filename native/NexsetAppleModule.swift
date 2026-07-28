public import ExpoModulesCore

#if canImport(FoundationModels)
import FoundationModels
#endif

public final class NexsetAppleModule: Module {
  private let appGroup = "group.com.anonymous.nexset"

  public func definition() -> ModuleDefinition {
    Name("NexsetApple")

    AsyncFunction("appleIntelligenceAvailability") { () -> [String: Any] in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        let available = SystemLanguageModel.default.isAvailable
        return [
          "available": available,
          "reason": available ? "可使用设备端 Foundation Models" : "当前设备、语言或系统设置尚不支持"
        ]
      }
      #endif
      return ["available": false, "reason": "需要 iOS 26 或更高版本"]
    }

    AsyncFunction("respond") { (instructions: String, prompt: String) async throws -> String in
      #if canImport(FoundationModels)
      if #available(iOS 26.0, *) {
        guard SystemLanguageModel.default.isAvailable else {
          throw NSError(
            domain: "NexsetAppleIntelligence",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Apple Intelligence 当前不可用"]
          )
        }
        let session = LanguageModelSession(instructions: instructions)
        let response = try await session.respond(to: prompt)
        return response.content
      }
      #endif
      throw NSError(
        domain: "NexsetAppleIntelligence",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "需要 iOS 26 或更高版本"]
      )
    }

    AsyncFunction("consumePendingIntent") { () -> String? in
      guard let defaults = UserDefaults(suiteName: self.appGroup) else { return nil }
      let action = defaults.string(forKey: "NexsetPendingIntent")
      defaults.removeObject(forKey: "NexsetPendingIntent")
      return action
    }
  }
}
