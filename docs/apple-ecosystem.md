# Apple 生态接入说明

Nexset 的 Apple 适配通过 Expo 57 原生开发构建生成 iPhone、Widget/Live Activity 与 Apple Watch targets。Expo Go 不包含这些自定义原生模块，必须使用 Development Build 或正式构建。

## 已接入能力

- Apple Watch：开始训练、手动记组、Core Motion 自动计数 Beta、休息结束触感、断连时排队回传。
- Apple 健康：读取训练、心率、体重、体脂；写入 Nexset 力量训练、体重和体脂。
- 系统入口：App Intents / 快捷指令可开始训练、记录当前组、同步健康。
- 系统界面：主屏训练卡片、锁屏实时活动、常驻训练通知、灵动岛紧凑/展开/最小布局。
- 训练体验：开始、记组、结束和警告触感；系统音频支持混音、压低其他音频或独占三种策略。
- Apple Intelligence：iOS 26+ Foundation Models 能力探测和本地生成桥接；不支持时继续使用现有 AI Provider，不伪装为可用。

## 首次原生构建

1. 在 `app.json` 的 `expo.ios` 下填写自己的 `appleTeamId`。这是开发者账号专属信息，仓库不会预填。
2. 在 Apple Developer 中确认以下标识可注册，并在需要时将 `com.anonymous` 前缀整体替换为自己的反向域名：
   - App：`com.anonymous.nexset`
   - Widget / Live Activity：`com.anonymous.nexset.widgets`
   - Watch：`com.anonymous.nexset.watch`
   - App Group：`group.com.anonymous.nexset`
3. 为 App 和 Watch 开启 HealthKit，为 App、Widget 和 Watch 开启相同 App Group；让 Xcode 自动管理签名。
4. 使用受 React Native 0.86 支持的 Node.js 22.13+ 或 24.3+，并安装完整 Xcode 与 CocoaPods 1.16.2+。
5. 生成项目并安装到真机：

   ```bash
   npx expo prebuild -p ios --clean
   npx expo run:ios --device
   ```

首次预构建会重建 `ios/`，提交前应检查生成差异。若项目已有手工 Xcode 修改，先备份或提交它们。

## 真机验收清单

- 在 iPhone「我的 → Apple 生态」授权健康，执行一次同步，确认体重/体脂和有氧记录没有重复。
- 从 iPhone 开始并结束一场训练，确认 Health 中出现一次力量训练。
- 从 Watch 开始训练并在两种记组模式下各记录一组；低于 0.7 的自动计数会以待确认状态进入 iPhone。
- 断开 iPhone 与 Watch 的实时连接后记组，重连后确认记录自动补传且不会重复。
- 将 Nexset 组件添加到主屏，从组件一键开始训练。
- 在支持灵动岛的 iPhone 上检查训练、休息倒计时和结束三个状态；普通机型检查锁屏实时活动。
- 在快捷指令中搜索 Nexset，分别测试「开始训练」「记录当前组」「同步健康」。
- 播放音乐时切换混音、压低和独占策略，确认结束训练后音频会话被释放。
- Apple Intelligence 仅在支持 iOS 26 Foundation Models、设备语言和系统设置的真机上显示可用；其余设备应显示不可用而非报错。

自动计数依赖手腕运动启发式，目前明确标记为 Beta；它适合辅助确认，不能替代用户对组数和动作质量的判断。
