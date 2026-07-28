# 参与 Nexset

感谢你愿意改进 Nexset。提交前请先搜索现有 Issue，较大的功能或架构调整建议先开 Issue 说明使用场景和设计方向。

## 本地开发

需要 Node.js 22.13.x、24.3+ 或 25+，以及 npm；请勿使用 React Native 0.86 不支持的 Node.js 23。iOS 原生能力还需要完整 Xcode 和 CocoaPods；Android 原生能力需要 Android Studio 与相应 SDK。

```bash
npm ci
npm run web
```

使用 Expo SDK 依赖时，请通过 `npx expo install <package>` 安装兼容版本。Apple 原生构建步骤见 [Apple 生态接入说明](docs/apple-ecosystem.md)。

## 提交前检查

```bash
npm run check
```

涉及计划生成、计划调整或意图路由时，还应运行对应本地评测：

```bash
npm run eval:plan
npm run eval:adjust
npm run eval:intent
```

真实模型批量评测可能产生费用，不应在未确认预算时运行，也不要把 API Key、个人健康数据或本地数据库提交到仓库。

## 变更约定

- 保持 TypeScript 严格模式通过，并为纯逻辑和缺陷修复补充测试。
- 数据库结构变更必须包含 Drizzle 迁移，并验证旧数据升级路径。
- AI 输出必须先经过本地结构和安全校验，再形成用户可确认的草案。
- 不得让 AI、同步或平台能力静默覆盖用户数据。
- UI 文案与功能状态应一致；尚未完成的能力必须明确标注。
- 不要提交生成的 `ios/`、`android/`、`dist/`、本地环境文件或开发工具私有设置。

Pull Request 请说明改动目的、验证结果、受影响平台；UI 变更建议附截图或录屏，原生能力变更请注明是否经过真机验证。
