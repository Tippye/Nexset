# Nexset

Nexset 是一个 Expo / React Native 跨平台健身计划与训练记录应用，支持 Web、iOS 和 Android。当前实现采用 local-first 架构：档案、计划、训练、有氧和身体数据默认保存在本地 SQLite；AI 只负责生成待确认草案，不会静默修改用户数据。

## 当前能力

- 引导问卷与本地安全模板计划。
- 今日训练、逐组记录、休息计时、训练小结与历史记录。
- 有氧、身体数据、动作库、自定义动作和训练统计。
- OpenAI-compatible `/chat/completions` 与 Anthropic `/v1/messages`。
- 流式文本、工具调用、JSON 文本兼容模式、错误分类和连接检测。
- PlanGenerationAgent：结构校验、动作 ID 校验、伤病禁忌、保守重量、TDEE 范围校验及失败降级。
- AI 计划周视图、逐项编辑、确认启用和本地 Agent/Badcase 日志。
- 近 7 天偏差报告、9 类计划 diff、安全 dry-run、48 小时忽略与 DailyAdjustAgent 建议卡。
- 对话教练的本地意图前置路由、数据查询、动作要点、安全红线和确认式记组。
- Apple Watch 开始训练、手动记组与设备端自动计数 Beta，支持离线排队回传。
- Apple 健康授权、训练/心率/体重/体脂同步，以及 Nexset 训练与身体数据写回。
- iOS 主屏训练组件、锁屏实时活动、常驻通知与灵动岛训练进度。
- 快捷指令/App Intents、训练触感反馈、系统音频混音策略与 Apple Intelligence 本地预留层。

真实模型对话的更开放问答仍需配置 API；WebDAV 属于后续阶段，界面中不会伪装为已完成。Apple 能力需要原生开发构建，不能在 Expo Go 中验证。

## 开发

要求 Node.js 22.13+（或 24.3+）、完整 Xcode 与 CocoaPods。

```bash
npm install
npm run web
```

其他平台：

```bash
npm run ios
npm run android
```

Apple 原生签名、开发构建和真机验证步骤见 [Apple 生态接入说明](docs/apple-ecosystem.md)。

## AI 配置

进入「我的 → AI 设置」，填写：

1. OpenAI 兼容或 Anthropic 协议。
2. HTTPS Base URL。
3. 服务商提供的模型 ID。
4. API Key。
5. 点击「测试连接并检测能力」。

OpenAI 兼容地址会自动追加 `/chat/completions`，Anthropic 地址会自动追加 `/messages`。原生端 Key 使用系统安全存储；Web 端仅能在当前浏览器中做本地加密保存，仍应使用限额 Key，避免公共设备。

生成计划时会向所配置的服务发送必要的档案、训练摘要、营养基线与动作约束。计划必须经用户确认后才写入数据库。

## 验证

```bash
npm run typecheck
npm run lint
npm test -- --runInBand
npm run eval:plan
npm run eval:adjust
npm run eval:intent
```

`eval:plan` 会生成 `eval/latest-report.md`，覆盖 60 份档案、20 份合法黄金样本和 20 份危险样本。真实模型批量评测需要测试 API Key 和调用费用确认，本地报告不会伪造该部分结果。

## 目录

```text
src/app/                 Expo Router 页面
src/ai/                  Provider、配置、Agent Runtime 与 PlanGenerationAgent
src/components/          可复用 UI
src/data/                内置动作库与伤病禁忌映射
src/db/                  SQLite Schema、迁移与 repositories
src/lib/                 计划 Schema、模板、营养公式与硬校验
src/store/               Zustand 应用状态
src/platform/apple/      HealthKit、Watch、实时活动、音频与系统入口桥接
widgets/                 主屏组件、锁屏实时活动与灵动岛布局
targets/watch/           Apple Watch SwiftUI 应用、训练会话与动作计数
native/                  Apple Intelligence / App Intent 原生桥接
eval/                    计划黄金集回归
```

产品定义见 [PRD](../PRD-Outputs/2026-07-26-2137-nexset-ai-fitness-prd.md)。
